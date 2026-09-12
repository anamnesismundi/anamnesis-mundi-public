const DATA_PATH = "data/";
const DATA_VERSION = "20260912-public-material-embodiment-genesis-last-1";

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
};

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => HTML_ENTITIES[character]
  );
}

async function fetchJson(fileName) {
  const response = await fetch(
    `${DATA_PATH}${fileName}?v=${DATA_VERSION}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      `Could not load ${fileName}: ${response.status}`
    );
  }

  return response.json();
}

async function loadDatabase() {
  try {
    const [
      eventsData,
      sourcesData,
      entitiesData,
      traditionsData,
      relationshipsData,
      cosmologiesData,
      phasesData,
      groupsData,
      realmsData
    ] = await Promise.all([
      fetchJson("events.json"),
      fetchJson("sources.json"),
      fetchJson("entities.json"),
      fetchJson("traditions.json"),
      fetchJson("relationships.json"),
      fetchJson("cosmologies.json"),
      fetchJson("phases.json"),
      fetchJson("groups.json"),
      fetchJson("realms.json")
    ]);

    return {
      events: eventsData.events || [],
      sources: sourcesData.sources || [],
      entities: entitiesData.entities || [],
      traditions: traditionsData.traditions || [],
      relationships: relationshipsData.relationships || [],
      cosmologies: cosmologiesData.cosmologies || [],
      phases: phasesData.phases || [],
      groups: groupsData.groups || [],
      realms: realmsData.realms || []
    };
  } catch (error) {
    console.error("Database loading failed:", error);
    return null;
  }
}

function getPhase(item, database) {
  if (!item.phaseId) {
    return null;
  }

  return (
    database.phases.find(
      phase => phase.id === item.phaseId
    ) || null
  );
}

function getPhaseLabel(item, database) {
  const customLabel =
    item?.display?.periodLabel;

  if (customLabel) {
    return customLabel;
  }

  const phase = getPhase(item, database);

  if (!phase) {
    return "Beyond Time";
  }

  return phase.shortLabel || phase.name;
}


/* ==========================================================
   SOURCE SYSTEM
   ========================================================== */

/*
  Public source citations use standardized work titles only.
  Collection information remains available in source metadata
  but is intentionally omitted from chronology cards.
  Each work is returned independently so the renderer can
  place it on its own readable row.
*/

function getSourceDisplayTitle(source) {
  if (!source) {
    return "";
  }

  return (
    source.displayName ||
    source.title ||
    source.name ||
    ""
  );
}


function getSourceCitationData(
  item,
  database
) {
  if (
    !Array.isArray(item.sourceAttestations) ||
    !item.sourceAttestations.length
  ) {
    return {
      sourceCount: 0,
      citationGroups: []
    };
  }

  const uniqueSources = [];
  const seenSourceIds = new Set();

  item.sourceAttestations
    .map(attestation =>
      database.sources.find(
        source =>
          source.id === attestation.sourceId
      ) || null
    )
    .filter(Boolean)
    .forEach(source => {
      const identity =
        source.id ||
        getSourceDisplayTitle(source);

      if (
        !identity ||
        seenSourceIds.has(identity)
      ) {
        return;
      }

      seenSourceIds.add(identity);
      uniqueSources.push(source);
    });

  return {
    sourceCount: uniqueSources.length,
    citationGroups: uniqueSources
      .map(getSourceDisplayTitle)
      .filter(Boolean)
  };
}

function createSourcesMarkup(
  item,
  database,
  className = "entity-sources"
) {
  const attestations =
    Array.isArray(item.sourceAttestations)
      ? item.sourceAttestations
      : [];

  const isComparativeAttestation =
    attestation => {
      const status =
        String(attestation?.status || "")
          .toLowerCase();

      const role =
        String(attestation?.role || "")
          .toLowerCase();

      return (
        status.includes("comparative") ||
        status.includes("parallel") ||
        role.includes("comparative") ||
        role.includes("parallel")
      );
    };

  const explicitPrimaryIds =
    Array.isArray(item.primarySourceIds)
      ? item.primarySourceIds
      : [];

  const explicitParallelIds =
    Array.isArray(item.parallelSourceIds)
      ? item.parallelSourceIds
      : [];

  const inferredPrimaryIds =
    attestations
      .filter(
        attestation =>
          !isComparativeAttestation(
            attestation
          )
      )
      .map(
        attestation =>
          attestation.sourceId
      )
      .filter(Boolean);

  const inferredParallelIds =
    attestations
      .filter(
        isComparativeAttestation
      )
      .map(
        attestation =>
          attestation.sourceId
      )
      .filter(Boolean);

  const primaryIds =
    explicitPrimaryIds.length
      ? explicitPrimaryIds
      : inferredPrimaryIds;

  const parallelIds =
    explicitParallelIds.length
      ? explicitParallelIds
      : inferredParallelIds;

  const primarySources =
    getSourcesByIds(
      primaryIds,
      database
    );

  const primaryIdSet =
    new Set(
      primarySources.map(
        source => source.id
      )
    );

  const parallelSources =
    getSourcesByIds(
      parallelIds,
      database
    ).filter(
      source =>
        !primaryIdSet.has(source.id)
    );

  const explicitPrimaryCitations =
    Array.isArray(item.primarySourceCitations)
      ? item.primarySourceCitations.filter(Boolean)
      : [];

  const explicitParallelCitations =
    Array.isArray(item.parallelSourceCitations)
      ? item.parallelSourceCitations.filter(Boolean)
      : [];

  const primaryCitationGroups =
    explicitPrimaryCitations.length
      ? explicitPrimaryCitations
      : createCitationGroupsFromSources(
          primarySources,
          true,
          false
        );

  const parallelCitationGroups =
    explicitParallelCitations.length
      ? explicitParallelCitations
      : createCitationGroupsFromSources(
          parallelSources,
          true,
          false
        );

  /*
    Legacy records without explicit semantic fields still
    represent direct attestations. Display them consistently
    as primary sources rather than reverting to the ambiguous
    generic Source / Sources label.
  */

  if (
    !primaryCitationGroups.length &&
    !parallelCitationGroups.length
  ) {
    const { citationGroups } =
      getSourceCitationData(
        item,
        database
      );

    if (!citationGroups.length) {
      return "";
    }

    return `
      <span class="${escapeHtml(className)} source-block">
        ${createSourceRowsMarkup([
          {
            label: "Primary Source",
            citations: citationGroups
          }
        ])}
      </span>
    `;
  }

  const sourceRows =
    createSourceRowsMarkup([
      {
        label: "Primary Source",
        citations: primaryCitationGroups
      },
      {
        label: "Parallels",
        citations: parallelCitationGroups
      }
    ]);

  return `
    <span class="${escapeHtml(className)} source-block">
      ${sourceRows}
    </span>
  `;
}


function getSourcesByIds(
  sourceIds,
  database
) {
  if (!Array.isArray(sourceIds)) {
    return [];
  }

  const seenSourceIds =
    new Set();

  return sourceIds
    .map(sourceId =>
      database.sources.find(
        source =>
          source.id === sourceId
      ) || null
    )
    .filter(source => {
      if (!source) {
        return false;
      }

      const identity =
        source.id ||
        getSourceDisplayTitle(source);

      if (
        !identity ||
        seenSourceIds.has(identity)
      ) {
        return false;
      }

      seenSourceIds.add(identity);
      return true;
    });
}


function getSemanticSourceDisplayTitle(
  source
) {
  /*
    Public display names are normalized in the source
    registry. Where a work has a well-established alternate
    title, the registry preserves both titles in one compact
    label for consistent use across the site.
  */
  return getSourceDisplayTitle(source);
}


function createCitationGroupsFromSources(
  sources,
  useSemanticTitles = false
) {
  if (!Array.isArray(sources)) {
    return [];
  }

  const seenTitles = new Set();

  return sources
    .map(source =>
      useSemanticTitles
        ? getSemanticSourceDisplayTitle(source)
        : getSourceDisplayTitle(source)
    )
    .filter(title => {
      if (
        !title ||
        seenTitles.has(title)
      ) {
        return false;
      }

      seenTitles.add(title);
      return true;
    });
}

function createSourceRowsMarkup(rows) {
  return rows
    .filter(row =>
      row.citations.length
    )
    .map(row => `
      <span class="source-row">
        <span class="source-label">${escapeHtml(row.label)}</span>
        <span class="source-list">
          ${row.citations
            .map(citation => `
              <span class="source-item">${escapeHtml(citation)}</span>
            `)
            .join("")}
        </span>
      </span>
    `)
    .join("");
}


function createSemanticSourcesMarkup(
  item,
  database,
  className = "entity-sources"
) {
  const hasPrimarySources =
    Array.isArray(item.primarySourceIds) &&
    item.primarySourceIds.length > 0;

  const hasParallelSources =
    Array.isArray(item.parallelSourceIds) &&
    item.parallelSourceIds.length > 0;

  /*
    If the item does not explicitly distinguish a primary
    reconstruction from parallel texts, preserve the
    existing Source / Sources behavior unchanged.
  */

  if (
    !hasPrimarySources &&
    !hasParallelSources
  ) {
    return createSourcesMarkup(
      item,
      database,
      className
    );
  }

  const primarySources =
    getSourcesByIds(
      item.primarySourceIds,
      database
    );

  const parallelSources =
    getSourcesByIds(
      item.parallelSourceIds,
      database
    );

  const explicitPrimaryCitations =
    Array.isArray(item.primarySourceCitations)
      ? item.primarySourceCitations.filter(Boolean)
      : [];

  const explicitParallelCitations =
    Array.isArray(item.parallelSourceCitations)
      ? item.parallelSourceCitations.filter(Boolean)
      : [];

  const primaryCitationGroups =
    explicitPrimaryCitations.length
      ? explicitPrimaryCitations
      : createCitationGroupsFromSources(
          primarySources,
          true,
          false
        );

  const parallelCitationGroups =
    explicitParallelCitations.length
      ? explicitParallelCitations
      : createCitationGroupsFromSources(
          parallelSources,
          true,
          false
        );

  const sourceRows =
    createSourceRowsMarkup([
      {
        label: "Primary Source",
        citations: primaryCitationGroups
      },
      {
        label: "Parallels",
        citations: parallelCitationGroups
      }
    ]);

  if (!sourceRows) {
    return createSourcesMarkup(
      item,
      database,
      className
    );
  }

  return `
    <span class="${escapeHtml(className)} source-block">
      ${sourceRows}
    </span>
  `;
}


/* ==========================================================
   ALTERNATIVE NAMES
   ========================================================== */

function createAlternativeNamesMarkup(
  item,
  className = "source"
) {
  const names = Array.isArray(
    item.alternativeNames
  )
    ? item.alternativeNames.filter(Boolean)
    : [];

  if (!names.length) {
    return "";
  }

  return `
    <span class="${escapeHtml(className)} alternative-names-block">
      <span class="alternative-names-label">
        Also known as
      </span>
      <span class="alternative-names-list">
        ${names
          .map(name => `
            <span class="alternative-name">${escapeHtml(name)}</span>
          `)
          .join("")}
      </span>
    </span>
  `;
}

/* ==========================================================
   SUMMARY
   ========================================================== */

function createSummaryMarkup(
  summary,
  className = ""
) {
  if (!summary) {
    return "";
  }

  const classAttribute = className
    ? ` class="${escapeHtml(className)}"`
    : "";

  return `
    <p${classAttribute}>
      ${escapeHtml(summary)}
    </p>
  `;
}
/* ==========================================================
   COMPARATIVE TRADITIONS
   ========================================================== */

function createComparativeTraditionsMarkup(
  entity,
  database
) {
  const traditions =
    Array.isArray(
      entity.comparativeTraditions
    )
      ? entity.comparativeTraditions
          .filter(
            tradition =>
              tradition &&
              tradition.name &&
              tradition.description
          )
      : [];

  if (!traditions.length) {
    return "";
  }

  const entries =
    traditions
      .map(tradition => {
        const explicitCitations =
          Array.isArray(
            tradition.sourceCitations
          )
            ? tradition.sourceCitations
                .filter(Boolean)
            : [];

        const sourceCitations =
          explicitCitations.length
            ? explicitCitations
            : Array.isArray(
                tradition.sourceIds
              )
              ? tradition.sourceIds
                  .map(sourceId =>
                    database?.sources?.find(
                      source =>
                        source.id === sourceId
                    )
                  )
                  .filter(Boolean)
                  .map(source =>
                    source.timelineCitation ||
                    source.displayName ||
                    source.title
                  )
                  .filter(Boolean)
              : [];

        const sourceMarkup =
          sourceCitations.length
            ? `
              <span class="comparative-tradition-sources source-block">
                ${createSourceRowsMarkup([
                  {
                    label:
                      sourceCitations.length === 1
                        ? "Source"
                        : "Sources",
                    citations: sourceCitations
                  }
                ])}
              </span>
            `
            : "";

        return `
          <article class="comparative-tradition">
            <span class="comparative-tradition-category">
              ${escapeHtml(
                tradition.category ||
                "Comparative Tradition"
              )}
            </span>

            <h3>
              ${escapeHtml(
                tradition.name
              )}
            </h3>

            <p>
              ${escapeHtml(
                tradition.description
              )}
            </p>

            ${sourceMarkup}
          </article>
        `;
      })
      .join("");

  return `
    <details class="group-explorer comparative-explorer">
      <summary>
        ${escapeHtml(
          entity.explorerTitle ||
          "Explore Comparative Traditions"
        )}
      </summary>

      <div class="comparative-traditions">
        ${entries}
      </div>
    </details>
  `;
}

/* ==========================================================
   COMPACT PLEROMATIC PROCESS
   ========================================================== */

function createPleromaticProcessMarkup(entity) {
  const process = entity.pleromaticProcess;

  if (
    !process ||
    !Array.isArray(process.entries) ||
    !process.entries.length
  ) {
    return "";
  }

  const entries = process.entries
    .map(entry => {
      const subtitle = entry.subtitle
        ? `<span class="pleromatic-process-subtitle">${escapeHtml(entry.subtitle)}</span>`
        : "";

      return `
        <article class="pleromatic-process-member">
          <span class="pleromatic-process-number">
            ${escapeHtml(entry.number || "")}
          </span>

          <span class="pleromatic-process-role">
            ${escapeHtml(entry.role || "Aeonic Power")}
          </span>

          <h3>
            ${escapeHtml(entry.name || "")}
          </h3>

          ${subtitle}

          <p>
            ${escapeHtml(entry.description || "")}
          </p>
        </article>
      `;
    })
    .join("");

  const note = process.note
    ? `
      <aside class="pleromatic-process-note">
        <span class="pleromatic-process-role">
          ${escapeHtml(process.note.role || "Context")}
        </span>

        <h3>
          ${escapeHtml(process.note.name || "")}
        </h3>

        <p>
          ${escapeHtml(process.note.description || "")}
        </p>
      </aside>
    `
    : "";

  return `
    <details class="group-explorer pleromatic-process-explorer">
      <summary>
        ${escapeHtml(process.explorerTitle || "Explore")}
      </summary>

      <div class="pleromatic-process-members">
        ${entries}
        ${note}
      </div>
    </details>
  `;
}


/* ==========================================================
   ENTITY CARD
   ========================================================== */

function createEntityCard(
  entity,
  database
) {
  const phase = getPhase(
    entity,
    database
  );

  const phaseLabel = getPhaseLabel(
    entity,
    database
  );

  const alternativeNames =
    createAlternativeNamesMarkup(
      entity,
      "source"
    );

  const sources =
    createSourcesMarkup(
      entity,
      database,
      "entity-sources"
    );

  const summary =
    createSummaryMarkup(
      entity.summary || ""
    );

  const pleromaticProcess =
    createPleromaticProcessMarkup(
      entity
    );

  const comparativeTraditions =
    createComparativeTraditionsMarkup(
      entity,
      database
    );

  return `
    <article
      class="event primary-entity"
      data-item-type="entity"
      data-entity-id="${escapeHtml(
        entity.id
      )}"
      data-phase-id="${escapeHtml(
        entity.phaseId || ""
      )}"
      data-phase-color="${escapeHtml(
        phase ? phase.colorKey : ""
      )}"
    >
      <span class="period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h2>
        ${escapeHtml(
          entity.displayName
        )}
      </h2>

      ${summary}

      ${alternativeNames}
      ${sources}
      ${pleromaticProcess}
      ${comparativeTraditions}
    </article>
  `;
}


/* ==========================================================
   STANDARD EXPANDED MEMBER
   ========================================================== */

function createExpandedMember(
  member,
  database,
  sequenceLabel = ""
) {
  const phaseLabel = getPhaseLabel(
    member,
    database
  );

  const alternativeNames =
    createAlternativeNamesMarkup(
      member,
      "group-member-aliases"
    );

  const summary =
    createSummaryMarkup(
      member.summary || ""
    );

  return `
    <article
      class="group-member"
      data-entity-id="${escapeHtml(
        member.id
      )}"
    >
      ${
        sequenceLabel
          ? `
            <span class="aeon-number group-member-number">
              ${escapeHtml(sequenceLabel)}
            </span>
          `
          : ""
      }

      <span class="group-member-period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h3>
        ${escapeHtml(member.displayName)}
      </h3>

      ${summary}

      ${alternativeNames}
    </article>
  `;
}


/* ==========================================================
   AEON MEMBER
   ========================================================== */

function createAeonMember(member) {
  const position =
    member.aeonicPosition || {};

  const sequenceNumber =
    position.sequenceNumber;

  const sequenceTotal =
    position.sequenceTotal || 12;

  const positionLabel =
    sequenceNumber
      ? `${sequenceNumber}/${sequenceTotal}`
      : "Aeon";

  const alternativeNames =
    createAlternativeNamesMarkup(
      member,
      "aeon-aliases"
    );

  const isSophia =
    member.id === "entity-sophia";

  /*
    Sophia remains inside The Twelve Aeons as 12/12.
    Her summary is displayed here. The later rupture
    remains a separate event, but the duplicate primary
    entity card is removed from the main timeline.
  */

  const summary =
    createSummaryMarkup(
      member.summary || ""
    );

  return `
    <article
      class="aeon-member${
        isSophia
          ? " aeon-member-sophia"
          : ""
      }"
      data-entity-id="${escapeHtml(
        member.id
      )}"
      data-aeon-number="${escapeHtml(
        sequenceNumber || ""
      )}"
    >
      <span class="aeon-number">
        ${escapeHtml(positionLabel)}
      </span>

      <h4>
        ${escapeHtml(member.displayName)}
      </h4>

      ${summary}

      ${alternativeNames}

      ${
        isSophia
          ? `
            <span class="aeon-threshold">
              Threshold of the cosmological rupture
            </span>
          `
          : ""
      }
    </article>
  `;
}


/* ==========================================================
   AEON DOMAIN
   ========================================================== */

function createAeonDomain(
  domain,
  database
) {
  const luminary =
    database.entities.find(
      entity =>
        entity.id === domain.luminaryId
    );

  const members =
    (domain.memberIds || [])
      .map(memberId =>
        database.entities.find(
          entity =>
            entity.id === memberId
        )
      )
      .filter(Boolean)
      .sort((a, b) => {
        const numberA =
          a.aeonicPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        const numberB =
          b.aeonicPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        return numberA - numberB;
      });

  const romanNumerals = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV"
  };

  const domainNumber =
    domain.domainNumber || "";

  const domainLabel =
    romanNumerals[domainNumber] ||
    domainNumber;

  return `
    <section
      class="aeon-domain"
      data-domain-number="${escapeHtml(
        domainNumber
      )}"
    >
      <header class="aeon-domain-header">
        <span class="aeon-domain-number">
          ${escapeHtml(domainLabel)}
        </span>

        <div class="aeon-domain-title">
          <span class="aeon-domain-label">
            Luminary
          </span>

          <h3>
            ${escapeHtml(
              luminary?.displayName ||
              domain.luminary ||
              ""
            )}
          </h3>
        </div>
      </header>

      <div class="aeon-domain-members">
        ${members
          .map(member =>
            createAeonMember(member)
          )
          .join("")}
      </div>
    </section>
  `;
}


/* ==========================================================
   SPIRITUAL GENERATIONS CARD
   ========================================================== */

function createSpiritualGenerationsCard() {
  const generations = [
    {
      number: "I",
      luminary: "Armozel",
      name: "Geradamas / Pigera-Adamas",
      description:
        "Geradamas (Pigera-Adamas) is the perfect, heavenly archetypal Human, placed in the first aeonic realm, the domain of Armozel.",
      note:
        "He is not the material Adam who appears later in the lower cosmos; the earthly Adam belongs to a subsequent stage of the narrative."
    },
    {
      number: "II",
      luminary: "Oroiael",
      name: "Seth",
      description:
        "The son of Geradamas is placed in the second aeonic realm, the domain of Oroiael. Through Seth, the spiritual lineage continues into the Seed of Seth associated with the third realm."
    },
    {
      number: "III",
      luminary: "Daveithai",
      name: "The Seed of Seth",
      description:
        "The offspring or spiritual lineage of Seth is placed in the third aeonic realm, the domain of Daveithai. The souls of the saints are also placed there. In the wider Sethian tradition, the Seed of Seth becomes associated with the spiritual or “immovable” race."
    },
    {
      number: "IV",
      luminary: "Eleleth",
      name: "The Souls Who Later Repent",
      description:
        "The fourth aeonic realm, the domain of Eleleth, receives the souls of those who were initially ignorant of the Fullness but later repented and turned toward the divine realm."
    }
  ];

  const members = generations
    .map(generation => `
      <article class="group-member">
        <span class="group-member-period">
          ${escapeHtml(generation.number)} · ${escapeHtml(generation.luminary)}
        </span>

        <h3>
          ${escapeHtml(generation.name)}
        </h3>

        <p>
          ${escapeHtml(generation.description)}
          ${
            generation.note
              ? `<em>${escapeHtml(generation.note)}</em>`
              : ""
          }
        </p>
      </article>
    `)
    .join("");

  return `
    <article
      class="event primary-group spiritual-generations-card"
      data-item-type="spiritual-generations"
      data-spiritual-generations="true"
      data-phase-id="phase-divine-emanation"
      data-phase-color="emanation"
    >
      <span class="period">
        Pleromatic Order
      </span>

      <h2>
        The Spiritual Generations
      </h2>

      <p>
        Within the established structure of the Pleroma, the narrative places successive spiritual figures and generations within the four Great Luminary realms. These belong to the divine, archetypal order presented before Sophia's independent generation and the emergence of the lower cosmos.
      </p>

      <span class="group-sources source-block">
        ${createSourceRowsMarkup([
          {
            label: "Primary Source",
            citations: [
              "THE SECRET BOOK OF JOHN (THE APOCRYPHON OF JOHN), NHC II,1; III,1; IV,1; BG 8502,2"
            ]
          },
          {
            label: "Parallels",
            citations: [
              "THE HOLY BOOK OF THE GREAT INVISIBLE SPIRIT (THE GOSPEL OF THE EGYPTIANS), NHC III,2; IV,2",
              "THE THREE STELES OF SETH, NHC VII,5"
            ]
          }
        ])}
      </span>

      <details class="group-explorer">
        <summary>
          Explore The Spiritual Generations
        </summary>

        <div class="group-members">
          ${members}

          <aside class="group-member spiritual-generations-note">
            <span class="group-member-period">
              Interpretative Note
            </span>

            <h3>
              Note on Foreknowledge
            </h3>

            <p>
              The placement of these spiritual generations precedes Sophia's independent generation and the emergence of Yaldabaoth in the narrative. This is significant: Geradamas arises from the foreknowledge of the perfect mind, while the text already assigns a place even to souls described as initially ignorant of the Fullness who later repent. The sequence therefore presents the spiritual lineage within the divine order before the lower cosmos comes into existence. This can be read as suggesting that the later drama of descent, ignorance, and return is already anticipated within the Pleromatic order, rather than the spiritual lineage being created afterward merely as a reaction to the Demiurge.
            </p>
          </aside>
        </div>
      </details>
    </article>
  `;
}


/* ==========================================================
   TWELVE AEONS CARD
   ========================================================== */

function createTwelveAeonsCard(
  group,
  database
) {
  const phase =
    getPhase(
      group,
      database
    );

  const phaseLabel =
    getPhaseLabel(
      group,
      database
    );

  const groupSources =
    createSemanticSourcesMarkup(
      group,
      database,
      "group-sources"
    );

  const domains =
    Array.isArray(
      group.structure?.domains
    )
      ? [...group.structure.domains].sort(
          (a, b) =>
            (a.domainNumber || 0) -
            (b.domainNumber || 0)
        )
      : [];

  const summary =
    createSummaryMarkup(
      group.summary || ""
    );

  return `
    <article
      class="event primary-group twelve-aeons-group"
      data-item-type="group"
      data-group-id="${escapeHtml(
        group.id
      )}"
      data-phase-id="${escapeHtml(
        group.phaseId || ""
      )}"
      data-phase-color="${escapeHtml(
        phase ? phase.colorKey : ""
      )}"
    >
      <span class="period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h2>
        ${escapeHtml(
          group.displayName
        )}
      </h2>

      ${summary}

      ${groupSources}

      ${
        domains.length
          ? `
            <details
              class="group-explorer aeon-explorer"
            >
              <summary>
                Explore ${escapeHtml(
                  group.displayName
                )}
              </summary>

              <div class="aeon-domains">
                ${domains
                  .map(domain =>
                    createAeonDomain(
                      domain,
                      database
                    )
                  )
                  .join("")}
              </div>
            </details>
          `
          : ""
      }
    </article>
  `;
}


/* ==========================================================
   AUTHORITY MEMBER
   ========================================================== */

function createAuthorityMember(
  member
) {
  const position =
    member.authorityPosition || {};

  const sequenceNumber =
    position.sequenceNumber;

  const sequenceTotal =
    position.sequenceTotal || 12;

  const positionLabel =
    sequenceNumber
      ? `${sequenceNumber}/${sequenceTotal}`
      : "Authority";

  const alternativeNames =
    createAlternativeNamesMarkup(
      member,
      "group-member-aliases"
    );

  const summary =
    createSummaryMarkup(
      member.summary || ""
    );

  return `
    <article
      class="group-member authority-member"
      data-entity-id="${escapeHtml(
        member.id
      )}"
      data-authority-number="${escapeHtml(
        sequenceNumber || ""
      )}"
    >
      <span class="group-member-period">
        ${escapeHtml(positionLabel)}
      </span>

      <h3>
        ${escapeHtml(
          member.displayName
        )}
      </h3>

      ${summary}

      ${alternativeNames}
    </article>
  `;
}


/* ==========================================================
   TWELVE AUTHORITIES EXPLORER
   ========================================================== */

function createTwelveAuthoritiesExplorer(
  group,
  database,
  event
) {
  const members =
    (group.memberIds || [])
      .map(memberId =>
        database.entities.find(
          entity =>
            entity.id === memberId
        )
      )
      .filter(Boolean)
      .sort((a, b) => {
        const numberA =
          a.authorityPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        const numberB =
          b.authorityPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        return numberA - numberB;
      });

  if (!members.length) {
    return "";
  }

  const contextualNote =
    event?.contextualNote
      ? `
        <div class="authority-contextual-note">
          ${escapeHtml(
            event.contextualNote
          )}
        </div>
      `
      : "";

  return `
    <details
      class="group-explorer authority-explorer"
    >
      <summary>
        Explore ${escapeHtml(
          group.displayName
        )}
      </summary>

      <div
        class="group-members authority-members"
      >
        ${members
          .map(member =>
            createAuthorityMember(member)
          )
          .join("")}
      </div>

      ${contextualNote}
    </details>
  `;
}

/* ==========================================================
   SEVEN POWERS MEMBER
   ========================================================== */

function createSevenPowersMember(
  member
) {
  const position =
    member.archonticPosition || {};

  const profile =
    member.archonticProfile || {};

  const sequenceNumber =
    position.sequenceNumber;

  const sequenceTotal =
    position.sequenceTotal || 7;

  const positionLabel =
    sequenceNumber
      ? `${sequenceNumber}/${sequenceTotal}`
      : "Archontic Figure";

  const figure =
    profile.figure ||
    member.displayName ||
    "";

  const form =
    profile.form || "";

  const associatedPower =
    profile.associatedPower || "";

  return `
    <article
      class="group-member seven-powers-member"
      data-entity-id="${escapeHtml(
        member.id
      )}"
      data-archontic-number="${escapeHtml(
        sequenceNumber || ""
      )}"
    >
      <span class="group-member-period">
        ${escapeHtml(positionLabel)}
      </span>

      <div class="seven-powers-field">
        <span class="seven-powers-label">
          FIGURE
        </span>

        <h3 class="seven-powers-figure">
          ${escapeHtml(figure)}
        </h3>
      </div>

      <div class="seven-powers-field">
        <span class="seven-powers-label">
          FORM
        </span>

        <p class="seven-powers-value">
          ${escapeHtml(form)}
        </p>
      </div>

      <div class="seven-powers-field">
        <span class="seven-powers-label">
          ASSOCIATED POWER
        </span>

        <p class="seven-powers-value">
          ${escapeHtml(associatedPower)}
        </p>
      </div>
    </article>
  `;
}


/* ==========================================================
   SEVEN POWERS EXPLORER
   ========================================================== */

function createSevenPowersExplorer(
  group,
  database
) {
  const members =
    (group.memberIds || [])
      .map(memberId =>
        database.entities.find(
          entity =>
            entity.id === memberId
        )
      )
      .filter(Boolean)
      .sort((a, b) => {
        const numberA =
          a.archonticPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        const numberB =
          b.archonticPosition
            ?.sequenceNumber ??
          Number.MAX_SAFE_INTEGER;

        return numberA - numberB;
      });

  if (!members.length) {
    return "";
  }

  const groupComparativeTraditions =
    group.comparativeTraditions || [];

  const memberComparativeTraditions =
    members.reduce(
      (
        traditions,
        member
      ) => [
        ...traditions,
        ...(
          member.comparativeTraditions ||
          []
        )
      ],
      []
    );

  const comparativeTraditions =
    createComparativeTraditionsMarkup(
      {
        comparativeTraditions: [
          ...groupComparativeTraditions
            .filter(
              tradition =>
                tradition.placement !==
                "after-member-parallels"
            ),
          ...memberComparativeTraditions,
          ...groupComparativeTraditions
            .filter(
              tradition =>
                tradition.placement ===
                "after-member-parallels"
            )
        ]
      },
      database
    );

  return `
    <details
      class="group-explorer seven-powers-explorer"
    >
      <summary>
        Explore ${escapeHtml(
          group.displayName
        )}
      </summary>

      <div
        class="group-members seven-powers-members"
      >
        ${members
          .map(member =>
            createSevenPowersMember(member)
          )
          .join("")}
      </div>

      ${comparativeTraditions}
    </details>
  `;
}

/* ==========================================================
   SEVEN PSYCHIC COMPONENTS EXPLORER
   ========================================================== */

function createPsychicComponentsExplorer(
  group
) {
  const components =
    Array.isArray(group.psychicComponents)
      ? [...group.psychicComponents]
          .sort(
            (a, b) =>
              (a.sequenceNumber || 0) -
              (b.sequenceNumber || 0)
          )
      : [];

  const regions =
    Array.isArray(group.anatomicalRegions)
      ? group.anatomicalRegions
          .filter(
            region =>
              region.label &&
              Array.isArray(
                region.assignments
              ) &&
              region.assignments.length
          )
      : [];

  if (
    !components.length &&
    !regions.length
  ) {
    return "";
  }

  const componentsMarkup =
    components.length
      ? `
        <section class="psychic-components-section">
          <span class="psychic-construction-section-label">
            THE SEVEN PSYCHIC COMPONENTS
          </span>

          <div class="psychic-components-list">
            ${components
              .map(component => `
                <article class="psychic-component">
                  <span class="psychic-component-number">
                    ${escapeHtml(component.sequenceNumber || "")}/7
                  </span>

                  <div class="psychic-component-field">
                    <span class="psychic-components-label">
                      POWER
                    </span>

                    <h3>
                      ${escapeHtml(component.power || "")}
                    </h3>
                  </div>

                  <div class="psychic-component-field">
                    <span class="psychic-components-label">
                      PSYCHIC COMPONENT
                    </span>

                    <p>
                      ${escapeHtml(component.component || "")}
                    </p>
                  </div>
                </article>
              `)
              .join("")}
          </div>
        </section>
      `
      : "";

  const anatomyMarkup =
    regions.length
      ? `
        <section class="angelic-anatomy-section">
          ${group.anatomicalIntroduction
            ? `
              <p class="angelic-anatomy-introduction">
                ${escapeHtml(group.anatomicalIntroduction)}
              </p>
            `
            : ""}

          <details class="angelic-anatomy-explorer">
            <summary>
              Explore The Archontic Makers of the Body
            </summary>

            <div class="anatomical-regions">
              ${regions
                .map(region => `
                  <details class="anatomical-region">
                    <summary>
                      <span>
                        ${escapeHtml(region.label)}
                      </span>

                      <span class="anatomical-region-count">
                        ${region.assignments.length}
                      </span>
                    </summary>

                    <div class="anatomical-assignments">
                      ${region.assignments
                        .map(assignment => `
                          <div
                            class="anatomical-assignment${assignment.status ? ` anatomical-assignment-${escapeHtml(assignment.status)}` : ""}"
                          >
                            <span class="anatomical-creator">
                              ${escapeHtml(assignment.creator || "")}
                            </span>

                            <span class="anatomical-part">
                              ${escapeHtml(assignment.part || "")}
                            </span>
                          </div>
                        `)
                        .join("")}
                    </div>
                  </details>
                `)
                .join("")}
            </div>

            ${group.anatomicalNote
              ? `
                <aside class="psychic-components-note anatomical-note">
                  <span class="psychic-components-label">
                    TEXTUAL NOTE
                  </span>

                  <p>
                    ${escapeHtml(group.anatomicalNote)}
                  </p>
                </aside>
              `
              : ""}
          </details>
        </section>
      `
      : "";

  return `
    <details
      class="group-explorer psychic-components-explorer"
    >
      <summary>
        Explore ${escapeHtml(group.displayName)}
      </summary>

      <div class="psychic-construction-content">
        ${componentsMarkup}
        ${anatomyMarkup}
      </div>
    </details>
  `;
}

/* ==========================================================
   THEMATIC PROFILE EXPLORER
   ========================================================== */

function createThematicProfilesExplorer(group) {
  const profiles =
    Array.isArray(group.thematicProfiles)
      ? group.thematicProfiles
      : [];

  if (!profiles.length) {
    return "";
  }

  return `
    <details class="group-explorer thematic-profiles-explorer">
      <summary>
        ${escapeHtml(
          group.explorerTitle ||
          `Explore ${group.displayName}`
        )}
      </summary>

      <div class="thematic-profiles-content">
        ${profiles.map(profile => `
          <article class="thematic-profile">
            <span class="thematic-profile-label">
              ${escapeHtml(profile.label || "")}
            </span>
            <h3>${escapeHtml(profile.title || "")}</h3>
            <p>${escapeHtml(profile.description || "")}</p>
          </article>
        `).join("")}
      </div>

      ${group.textualNote ? `
        <aside class="psychic-components-note thematic-profiles-note">
          <span class="psychic-components-label">TEXTUAL NOTE</span>
          <p>${escapeHtml(group.textualNote)}</p>
        </aside>
      ` : ""}
    </details>
  `;
}


/* ==========================================================
   COMPACT CONTEXT PROFILE EXPLORER
   ========================================================== */

function createContextProfileExplorer(
  group
) {
  const profile = group.contextProfile;

  if (
    !profile ||
    !profile.title ||
    !profile.description
  ) {
    return "";
  }

  return `
    <details
      class="group-explorer context-profile-explorer"
    >
      <summary>
        Explore ${escapeHtml(group.displayName)}
      </summary>

      <div class="context-profile-content">
        <span class="context-profile-label">
          ${escapeHtml(
            profile.label || "Context"
          )}
        </span>

        <h3>
          ${escapeHtml(profile.title)}
        </h3>

        <p>
          ${escapeHtml(profile.description)}
        </p>
      </div>
    </details>
  `;
}


/* ==========================================================
   EVENT GROUP EXPLORERS
   ========================================================== */

function createEventGroupExplorers(
  event,
  database
) {
  if (
    !Array.isArray(
      event.resultGroupIds
    ) ||
    !event.resultGroupIds.length
  ) {
    return "";
  }

  return event.resultGroupIds
    .map(groupId => {
      const group =
        database.groups.find(
          candidate =>
            candidate.id === groupId
        );

      if (!group) {
        return "";
      }

     if (
  group.id ===
  "group-twelve-authorities"
) {
  return createTwelveAuthoritiesExplorer(
    group,
    database,
    event
  );
}

      if (
  group.id ===
  "group-seven-powers"
) {
  return createSevenPowersExplorer(
    group,
    database
  );
}

      if (
  group.id ===
  "group-seven-psychic-components"
) {
  return createPsychicComponentsExplorer(
    group
  );
}

      if (
  group.groupType ===
  "thematic-profiles"
) {
  return createThematicProfilesExplorer(
    group
  );
}

      if (
  group.groupType ===
  "comparative-traditions"
) {
  return createComparativeTraditionsMarkup(
    group,
    database
  );
}

      if (
  group.id ===
  "group-luminous-epinoia"
) {
  return createContextProfileExplorer(
    group
  );
}

return "";
    })
    .join("");
}


/* ==========================================================
   GROUP CARD
   ========================================================== */

function createGroupCard(
  group,
  database
) {
  if (
    group.id ===
    "group-twelve-aeons"
  ) {
    return createTwelveAeonsCard(
      group,
      database
    );
  }

  const phase =
    getPhase(
      group,
      database
    );

  const phaseLabel =
    getPhaseLabel(
      group,
      database
    );

  const members =
    (group.memberIds || [])
      .map(memberId =>
        database.entities.find(
          entity =>
            entity.id === memberId
        )
      )
      .filter(Boolean)
      .sort((a, b) => {
        const orderA =
          a.display?.order ??
          Number.MAX_SAFE_INTEGER;

        const orderB =
          b.display?.order ??
          Number.MAX_SAFE_INTEGER;

        return orderA - orderB;
      });

  const expandedMembers =
    members
      .map((member, memberIndex) =>
        createExpandedMember(
          member,
          database,
          group.id === "group-four-luminaries"
            ? `${memberIndex + 1}/${members.length}`
            : ""
        )
      )
      .join("");

  const groupSources =
    createSemanticSourcesMarkup(
      group,
      database,
      "group-sources"
    );
  const summary =
    createSummaryMarkup(
      group.summary || ""
    );

  return `
    <article
      class="event primary-group"
      data-item-type="group"
      data-group-id="${escapeHtml(
        group.id
      )}"
      data-phase-id="${escapeHtml(
        group.phaseId || ""
      )}"
      data-phase-color="${escapeHtml(
        phase ? phase.colorKey : ""
      )}"
    >
      <span class="period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h2>
        ${escapeHtml(
          group.displayName
        )}
      </h2>

      ${summary}

      ${groupSources}

      ${
        members.length
          ? `
            <details
              class="group-explorer"
            >
              <summary>
                Explore ${escapeHtml(
                  group.displayName
                )}
              </summary>

              <div class="group-members">
                ${expandedMembers}
              </div>
            </details>
          `
          : ""
      }
    </article>
  `;
}


/* ==========================================================
   EVENT CARD
   ========================================================== */

function createEventCard(
  event,
  database
) {
  const phase =
    getPhase(
      event,
      database
    );

  const phaseLabel =
    getPhaseLabel(
      event,
      database
    );

  const publicStatus =
    event.contentStatus
      ?.publicLabel || "";

  const statusLabel =
    publicStatus
      ? `
        <span class="source">
          Research status:
          ${escapeHtml(publicStatus)}
        </span>
      `
      : "";

  const alternativeNames =
    createAlternativeNamesMarkup(
      event,
      "event-aliases"
    );

  const sources =
    createSemanticSourcesMarkup(
      event,
      database,
      "event-sources"
    );

  const groupExplorers =
    createEventGroupExplorers(
      event,
      database
    );

  const comparativeTraditions =
    createComparativeTraditionsMarkup(
      event,
      database
    );

  const summary =
    createSummaryMarkup(
      event.summary || ""
    );
  
const contextualNote =
  event.id === "event-formation-subordinate-rulers"
    ? ""
    : createSummaryMarkup(
        event.contextualNote || "",
        "event-contextual-note"
      );
  
  return `
    <article
      class="event primary-event"
      data-item-type="event"
      data-event-id="${escapeHtml(
        event.id
      )}"
      data-phase-id="${escapeHtml(
        event.phaseId || ""
      )}"
      data-phase-color="${escapeHtml(
        phase ? phase.colorKey : ""
      )}"
      data-content-status="${escapeHtml(
        event.contentStatus
          ?.classification || ""
      )}"
    >
      <span class="period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h2>
        ${escapeHtml(
          event.displayName
        )}
      </h2>

      ${summary}
      ${contextualNote}
      
      ${alternativeNames}
      ${sources}
      ${groupExplorers}
      ${comparativeTraditions}
      ${statusLabel}
    </article>
  `;
}


/* ==========================================================
   REALM SYSTEM
   ========================================================== */

/*
  Realms are not chronological nodes.

  They are ontological regions that visually
  surround the entities, groups and events
  belonging to them.

  Pleroma is therefore rendered as a background
  region rather than as another card on the
  timeline.
*/

function getTimelineEntryId(entry) {
  if (
    !entry ||
    !entry.item
  ) {
    return "";
  }

  return entry.item.id || "";
}

function entryBelongsToRealm(
  entry,
  realm
) {
  if (
    !entry ||
    !realm ||
    !realm.scope
  ) {
    return false;
  }

  if (
    entry.type === "spiritual-generations"
  ) {
    return realm.id === "realm-pleroma";
  }

  const entryId =
    getTimelineEntryId(entry);

  if (!entryId) {
    return false;
  }

  if (
    entry.type === "entity" &&
    Array.isArray(
      realm.scope.containsEntityIds
    )
  ) {
    return realm.scope
      .containsEntityIds
      .includes(entryId);
  }

  if (
    entry.type === "group" &&
    Array.isArray(
      realm.scope.containsGroupIds
    )
  ) {
    return realm.scope
      .containsGroupIds
      .includes(entryId);
  }

  if (
    entry.type === "event" &&
    Array.isArray(
      realm.scope.containsEventIds
    )
  ) {
    return realm.scope
      .containsEventIds
      .includes(entryId);
  }

  return false;
}

function getTimelineElementForEntry(
  timeline,
  entry
) {
  if (
    entry.type === "spiritual-generations"
  ) {
    return timeline.querySelector(
      '[data-spiritual-generations="true"]'
    );
  }

  const entryId =
    getTimelineEntryId(entry);

  if (!entryId) {
    return null;
  }

  if (entry.type === "entity") {
    return timeline.querySelector(
      `[data-entity-id="${CSS.escape(
        entryId
      )}"].primary-entity`
    );
  }

  if (entry.type === "group") {
    return timeline.querySelector(
      `[data-group-id="${CSS.escape(
        entryId
      )}"].primary-group`
    );
  }

  if (entry.type === "event") {
    return timeline.querySelector(
      `[data-event-id="${CSS.escape(
        entryId
      )}"].primary-event`
    );
  }

  return null;
}

function createRealmOverlay(realm) {
  const overlay =
    document.createElement("section");

  const realmClassName =
    realm.id
      .replace(/^realm-/, "")
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "-"
      );

  overlay.className = [
    "realm-region",
    `realm-${realmClassName}`
  ].join(" ");

  overlay.dataset.realmId =
    realm.id;

  const label =
    realm.display?.label ||
    realm.displayName ||
    "";

  const subtitle =
    realm.display?.subtitle ||
    "";

  const summary =
    realm.summary || "";

  overlay.innerHTML = `
    <div class="realm-region-copy">
      ${
        label
          ? `
            <span class="realm-region-name">
              ${escapeHtml(label)}
            </span>
          `
          : ""
      }

      ${
        subtitle
          ? `
            <span class="realm-region-subtitle">
              ${escapeHtml(subtitle)}
            </span>
          `
          : ""
      }

      ${
        summary
          ? `
            <span class="realm-region-summary">
              ${escapeHtml(summary)}
            </span>
          `
          : ""
      }
    </div>
  `;

  return overlay;
}

function positionRealmOverlay(
  timeline,
  overlay,
  entries,
  realm
) {
  const elements =
    entries
      .map(entry =>
        getTimelineElementForEntry(
          timeline,
          entry
        )
      )
      .filter(Boolean);

  if (!elements.length) {
    overlay.hidden = true;
    return;
  }

  /*
    Every realm reserves a complete introductory band before its
    first chronology card. The class is assigned from realm data,
    so future realms inherit the same structure automatically.
  */
  const firstElement =
    realm?.id === "realm-pleroma"
      ? elements.find(
          element =>
            element.dataset.entityId !==
            "entity-monad"
        ) || elements[0]
      : elements[0];

  firstElement.classList.add(
    "realm-start-entry"
  );

  /*
    Reserve enough real document-flow space for the complete realm
    introduction at the current viewport width. This prevents the
    first card from colliding with a note that wraps differently in
    mobile browsers or after an orientation change.
  */
  const realmCopy =
    overlay.querySelector(
      ".realm-region-copy"
    );

  overlay.hidden = false;

  if (realmCopy) {
    const isMobile =
      window.matchMedia(
        "(max-width: 700px)"
      ).matches;

    const minimumClearance =
      isMobile ? 245 : 235;

    const copyBottom =
      realmCopy.offsetTop +
      realmCopy.getBoundingClientRect().height;

    const measuredClearance =
      Math.max(
        minimumClearance,
        Math.ceil(
          copyBottom +
          (isMobile ? 84 : 64)
        )
      );

    firstElement.style.setProperty(
      "--realm-intro-clearance",
      `${measuredClearance}px`
    );
  }

  const timelineRect =
    timeline.getBoundingClientRect();

  const elementRects =
    elements.map(
      element =>
        element.getBoundingClientRect()
    );

  const topOffset =
    Number.isFinite(
      realm?.display?.topOffset
    )
      ? realm.display.topOffset
      : 55;

  const bottomOffset =
    Number.isFinite(
      realm?.display?.bottomOffset
    )
      ? realm.display.bottomOffset
      : 55;

  let topPosition =
    Math.min(
      ...elementRects.map(
        rect => rect.top
      )
    ) -
    timelineRect.top -
    topOffset;

  /*
    Pleroma begins at the actual First Unfolding node.
    This avoids estimating its threshold from Barbelo's card,
    whose position changes when Monad's explorers are opened.
  */
  if (realm?.id === "realm-pleroma") {
    const thresholdNode =
      timeline.querySelector(
        ".pleroma-threshold-node"
      );

    if (thresholdNode) {
      const thresholdRect =
        thresholdNode.getBoundingClientRect();

      topPosition =
        thresholdRect.top -
        timelineRect.top +
        thresholdRect.height / 2;
    }
  }

  const measuredBottom =
    Math.max(
      ...elementRects.map(
        rect => rect.bottom
      )
    ) -
    timelineRect.top +
    bottomOffset;

  const bottomPosition =
    realm?.display?.extendToTimelineEnd
      ? Math.max(
          measuredBottom,
          timeline.scrollHeight
        )
      : measuredBottom;

  const safeTop =
    Math.max(
      0,
      topPosition
    );

  overlay.style.top =
    `${safeTop}px`;

  overlay.style.height =
    `${Math.max(
      0,
      bottomPosition - safeTop
    )}px`;
}

function renderRealmRegions(
  timeline,
  timelineItems,
  database
) {
  timeline
    .querySelectorAll(
      ".realm-region"
    )
    .forEach(
      region =>
        region.remove()
    );

  const activeRealms =
    database.realms.filter(
      realm =>
        realm.display?.mode ===
        "ambient-region"
    );

  if (!activeRealms.length) {
    return;
  }

  const realmRenderState = [];

  activeRealms.forEach(
    realm => {
      const entries =
        timelineItems.filter(
          entry =>
            entryBelongsToRealm(
              entry,
              realm
            )
        );

      if (!entries.length) {
        return;
      }

      const overlay =
        createRealmOverlay(
          realm
        );

      timeline.prepend(
        overlay
      );

      realmRenderState.push({
        realm,
        entries,
        overlay
      });
    }
  );

  const repositionRealms = () => {
    realmRenderState.forEach(
      ({
        realm,
        entries,
        overlay
      }) => {
        positionRealmOverlay(
          timeline,
          overlay,
          entries,
          realm
        );
      }
    );
  };

  requestAnimationFrame(
    repositionRealms
  );

  timeline
    .querySelectorAll("details")
    .forEach(details => {
      details.addEventListener(
        "toggle",
        () => {
          requestAnimationFrame(
            repositionRealms
          );
        }
      );
    });

  window.addEventListener(
    "resize",
    () => {
      requestAnimationFrame(
        repositionRealms
      );
    },
    {
      passive: true
    }
  );
}


/* ==========================================================
   PRIMARY TIMELINE ITEMS
   ========================================================== */

function getPrimaryTimelineItems(
  database
) {
  const primaryEntities =
    database.entities
      .filter(
        entity =>
          entity.display?.level ===
            "primary" &&
          entity.id !==
            "entity-sophia"
      )
      .map(entity => ({
        type: "entity",

        order:
          entity.display?.order ??
          Number.MAX_SAFE_INTEGER,

        item: entity
      }));

  const primaryGroups =
    database.groups
      .filter(
        group =>
          group.display?.level ===
          "primary"
      )
      .map(group => ({
        type: "group",

        order:
          group.display?.order ??
          Number.MAX_SAFE_INTEGER,

        item: group
      }));

  const primaryEvents =
    database.events
      .filter(
        event =>
          event.display?.level ===
          "primary"
      )
      .map(event => ({
        type: "event",

        order:
          event.display?.order ??
          Number.MAX_SAFE_INTEGER,

        item: event
      }));

  const spiritualGenerationsEntry = {
    type: "spiritual-generations",
    order: 6.1,
    item: {
      id: "virtual-spiritual-generations",
      displayName: "The Spiritual Generations"
    }
  };

  return [
    ...primaryEntities,
    ...primaryGroups,
    spiritualGenerationsEntry,
    ...primaryEvents
  ].sort(
    (a, b) => {
      if (
        a.order !==
        b.order
      ) {
        return (
          a.order -
          b.order
        );
      }

      return String(
        a.item.displayName
      ).localeCompare(
        String(
          b.item.displayName
        )
      );
    }
  );
}


function createPublicContinuationMarkup() {
  return `
    <section class="public-continuation" aria-labelledby="public-continuation-title">
      <span class="public-continuation-label">The Chronology Continues</span>
      <h2 id="public-continuation-title">Anamnesis Mundi Is Growing</h2>
      <p>
        Anamnesis Mundi is growing through active, ongoing research into ancient cosmologies, sacred texts, and humanity’s search for its origins.
      </p>
      <p>
        Anamnesis Mundi is a personal project that I wish to share with others. It is thought of as a clear point of departure for further inquiry—and as a place readers can return to as their own exploration deepens.
      </p>
      <p>
        The published chronology currently extends through the Material Cosmos. Further realms, primary-source research, and comparative traditions will be added progressively as the work continues.
      </p>
      <div class="public-support">
        <span class="public-support-label">Support Anamnesis Mundi</span>
        <p>
          Voluntary contributions help sustain the research, development, and continued expansion of this freely accessible resource. No goods, services, or other benefits are provided in return.
        </p>
        <a
          class="public-support-link"
          href="https://ko-fi.com/anamnesismundi"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support Anamnesis Mundi on Ko-fi (opens in a new tab)"
        >
          Make a Voluntary Contribution
        </a>
      </div>
    </section>
  `;
}


/* ==========================================================
   RENDER TIMELINE
   ========================================================== */

async function renderTimeline() {
  const database =
    await loadDatabase();

  if (!database) {
    return;
  }

  const timeline =
    document.getElementById(
      "timeline"
    );

  if (!timeline) {
    console.error(
      "Timeline element was not found."
    );
    return;
  }

  const timelineItems =
    getPrimaryTimelineItems(
      database
    );

  if (!timelineItems.length) {
    timeline.innerHTML = `
      <p class="timeline-message">
        No primary timeline items are available yet.
      </p>
    `;

    return;
  }

  timeline.innerHTML =
    timelineItems
      .map(entry => {
        if (
          entry.type ===
            "spiritual-generations"
        ) {
          return createSpiritualGenerationsCard();
        }

        if (
          entry.type === "group"
        ) {
          return createGroupCard(
            entry.item,
            database
          );
        }

        if (
          entry.type === "event"
        ) {
          return createEventCard(
            entry.item,
            database
          );
        }

        return createEntityCard(
          entry.item,
          database
        );
      })
      .join("") +
    createPublicContinuationMarkup();

  const monad =
    timeline.querySelector(
      '[data-entity-id="entity-monad"].primary-entity'
    );

  if (monad) {
    monad.insertAdjacentHTML(
      "afterend",
      `
        <div
          class="pleroma-threshold"
          aria-label="The first unfolding into the Pleroma"
        >
          <span class="pleroma-threshold-label">
            The First Unfolding
          </span>

          <span
            class="pleroma-threshold-node"
            aria-hidden="true"
          ></span>
        </div>
      `
    );

    monad.classList.add(
      "is-awaiting-reveal"
    );

    if (
      "IntersectionObserver" in window
    ) {
      const monadObserver =
        new IntersectionObserver(
          entries => {
            if (
              entries.some(
                entry =>
                  entry.isIntersecting
              )
            ) {
              monad.classList.add(
                "is-revealed"
              );

              monadObserver.disconnect();
            }
          },
          {
            threshold: 0.18
          }
        );

      monadObserver.observe(monad);
    } else {
      monad.classList.add(
        "is-revealed"
      );
    }
  }

  /*
    Realm overlays are prepended to the timeline and therefore make
    DOM nth-of-type parity unreliable. Freeze each ordinary card's
    actual visual side after those overlays exist, then let every
    explorer component inherit that explicit ownership.
  */
  function synchronizeTimelineCardSides() {
    timeline
      .querySelectorAll(
        ".event"
      )
      .forEach(eventElement => {
        eventElement.classList.remove(
          "timeline-card-left",
          "timeline-card-right"
        );

        if (
          eventElement.dataset.entityId ===
          "entity-monad"
        ) {
          return;
        }

        const textAlignment =
          window.getComputedStyle(
            eventElement
          ).textAlign;

        eventElement.classList.add(
          textAlignment === "right"
            ? "timeline-card-right"
            : "timeline-card-left"
        );
      });
  }

  function updateTimelineStart() {
    const monad =
      timeline.querySelector(
        '[data-entity-id="entity-monad"].primary-entity'
      );

    if (!monad) {
      return;
    }

    const thresholdNode =
      timeline.querySelector(
        ".pleroma-threshold-node"
      );

    const mobilePleromaStart =
      window.matchMedia(
        "(max-width: 700px)"
      ).matches
        ? timeline.querySelector(
            '[data-entity-id="entity-barbelo"].primary-entity'
          )
        : null;

    const axisStart =
      mobilePleromaStart
        ? mobilePleromaStart.offsetTop
        : thresholdNode
          ? thresholdNode.offsetParent.offsetTop +
            thresholdNode.offsetTop +
            thresholdNode.offsetHeight / 2
          : monad.offsetTop +
            monad.offsetHeight;

    timeline.style.setProperty(
      "--timeline-start",
      `${axisStart}px`
    );

    /*
      The public and complete builds expose different final cards.
      Measuring the last rendered event keeps the same code safe in
      both: the axis ends with the final visible chronology card and
      never continues into the timeline's trailing padding.
    */
    const renderedEvents =
      Array.from(
        timeline.querySelectorAll(
          ".event"
        )
      ).filter(
        eventElement =>
          !eventElement.hidden &&
          window.getComputedStyle(
            eventElement
          ).display !== "none"
      );

    const lastRenderedEvent =
      renderedEvents[
        renderedEvents.length - 1
      ];

    const axisEnd =
      lastRenderedEvent
        ? lastRenderedEvent.offsetTop +
          lastRenderedEvent.offsetHeight
        : axisStart;

    timeline.style.setProperty(
      "--timeline-length",
      `${Math.max(
        0,
        axisEnd - axisStart
      )}px`
    );

    /*
      The desktop public axis meets the short horizontal divider
      above the continuation section. Mobile continues to use the
      final-card length above, preserving its approved geometry.
    */
    const publicContinuation =
      timeline.querySelector(
        ".public-continuation"
      );

    const desktopAxisEnd =
      publicContinuation
        ? publicContinuation.offsetTop
        : axisEnd;

    timeline.style.setProperty(
      "--timeline-end",
      `${Math.max(
        axisStart,
        desktopAxisEnd
      )}px`
    );

    const eventAxisPosition =
      eventId => {
        const eventElement =
          timeline.querySelector(
            `[data-event-id="${eventId}"]`
          );

        if (!eventElement) {
          return null;
        }

        /*
          Event markers sit 64px from the top of their card.
          Half the marker height places the color anchor at its
          visual centre, relative to the start of the main axis.
        */
        return Math.max(
          0,
          eventElement.offsetTop +
            70 -
            axisStart
        );
      };

    const rupturePosition =
      eventAxisPosition(
        "event-sophia-independent-generation"
      );

    const demiurgicPosition =
      eventAxisPosition(
        "event-yaldabaoth-emergence"
      );

    const materialPosition =
      eventAxisPosition(
        "event-ordering-material-cosmos"
      );

    if (rupturePosition !== null) {
      timeline.style.setProperty(
        "--axis-rupture-fade",
        `${Math.max(
          340,
          rupturePosition - 180
        )}px`
      );

      timeline.style.setProperty(
        "--axis-rupture",
        `${rupturePosition + 20}px`
      );
    }

    if (demiurgicPosition !== null) {
      timeline.style.setProperty(
        "--axis-demiurgic",
        `${demiurgicPosition + 20}px`
      );
    }

    if (materialPosition !== null) {
      timeline.style.setProperty(
        "--axis-material-fade",
        `${Math.max(
          0,
          materialPosition - 220
        )}px`
      );

      timeline.style.setProperty(
        "--axis-material",
        `${materialPosition + 20}px`
      );
    }

  }

  /*
    Realm spacing changes event offsets. Install and measure those
    regions before the axis is calculated, then keep this order for
    every expandable-content and viewport update.
  */
  renderRealmRegions(
    timeline,
    timelineItems,
    database
  );

  /*
    renderRealmRegions prepends its overlays synchronously. Read the
    resulting card alignment only after that DOM structure is final.
  */
  synchronizeTimelineCardSides();

  requestAnimationFrame(
    updateTimelineStart
  );

  timeline
    .querySelectorAll("details")
    .forEach(details => {
      details.addEventListener(
        "toggle",
        () => {
          requestAnimationFrame(
            updateTimelineStart
          );
        }
      );
    });

  const monadComparative =
    timeline.querySelector(
      '[data-entity-id="entity-monad"] .comparative-explorer'
    );

  if (monadComparative) {
    monadComparative.addEventListener(
      "toggle",
      updateTimelineStart
    );
  }

  window.addEventListener(
    "resize",
    () => {
      synchronizeTimelineCardSides();
      updateTimelineStart();
    }
  );
}

function initializeChronologyEntry() {
  const entry =
    document.querySelector(
      ".begin"
    );

  const timeline =
    document.getElementById(
      "timeline"
    );

  if (!entry || !timeline) {
    return;
  }

  entry.addEventListener(
    "click",
    event => {
      event.preventDefault();

      entry.setAttribute(
        "aria-expanded",
        "true"
      );

      timeline.removeAttribute(
        "aria-hidden"
      );
      timeline.removeAttribute(
        "inert"
      );

      document.body.classList.remove(
        "chronology-locked"
      );
      document.body.classList.add(
        "chronology-entered"
      );

      const reduceMotion =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

      /*
        Two frames allow the newly revealed timeline to enter
        layout before the browser calculates its scroll target.
      */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          timeline.scrollIntoView({
            behavior:
              reduceMotion
                ? "auto"
                : "smooth",
            block: "start"
          });
        });
      });
    }
  );
}

initializeChronologyEntry();
renderTimeline();
