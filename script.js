/*
  Every fresh navigation and reload begins at the top of the
  introduction. Browsers otherwise restore the previous scroll
  offset on F5 / Reload, which can leave the hero visibly cropped.
  Explicit hash links retain their native destination.
*/
function resetInitialPagePosition() {
  if (window.location.hash) {
    return;
  }

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto"
  });
}

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

resetInitialPagePosition();

window.addEventListener(
  "pageshow",
  () => {
    requestAnimationFrame(
      resetInitialPagePosition
    );
  }
);

const DATA_PATH = "data/";
const DATA_VERSION = "20260918-public-pleroma-sequences-realm-bg-1";

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


function createAtomicCitationMarkup(citation) {
  const manuscriptClusterPattern =
    /NHC\s+[IVXLCDM]+,\d+(?:\s*;\s*(?:(?:NHC\s+)?[IVXLCDM]+,\d+|BG\s+8502,\d+))*|BG\s+8502,\d+|CODEX\s+TCHACOS/gi;

  let lastIndex = 0;
  let markup = "";

  String(citation).replace(
    manuscriptClusterPattern,
    (cluster, offset) => {
      markup += escapeHtml(
        String(citation).slice(lastIndex, offset)
      );

      const units = cluster
        .split(/\s*;\s*/)
        .filter(Boolean);

      let activeSiglum = "";

      markup += units
        .map((unit, index) => {
          let normalizedUnit = unit.trim();

          if (/^NHC\s+/i.test(normalizedUnit)) {
            activeSiglum = "NHC";
          } else if (
            activeSiglum === "NHC" &&
            /^[IVXLCDM]+,\d+$/i.test(normalizedUnit)
          ) {
            normalizedUnit = `NHC ${normalizedUnit}`;
          } else {
            activeSiglum = "";
          }

          const separator =
            index < units.length - 1
              ? ";"
              : "";

          return `
            <span class="citation-unit">${escapeHtml(normalizedUnit + separator)}</span>
          `;
        })
        .join(" ");

      lastIndex = offset + cluster.length;
      return cluster;
    }
  );

  markup += escapeHtml(
    String(citation).slice(lastIndex)
  );

  return markup;
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
              <span class="source-item">${createAtomicCitationMarkup(citation)}</span>
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
  const translationRenderings =
    Array.isArray(
      item.translationRenderings
    )
      ? item.translationRenderings.filter(
          Boolean
        )
      : [];

  const sourceDesignations =
    Array.isArray(
      item.sourceDesignations
    )
      ? item.sourceDesignations.filter(
          Boolean
        )
      : [];

  const alternativeNames =
    Array.isArray(
      item.alternativeNames
    )
      ? item.alternativeNames.filter(
          Boolean
        )
      : [];

  const createNamesBlock = (
    label,
    names,
    modifier = "",
    rowSize = 0
  ) => {
    if (!names.length) {
      return "";
    }

    const rows =
      rowSize > 0
        ? names.reduce(
            (groups, name, index) => {
              const groupIndex =
                Math.floor(index / rowSize);

              if (!groups[groupIndex]) {
                groups[groupIndex] = [];
              }

              groups[groupIndex].push(name);
              return groups;
            },
            []
          )
        : [names];

    return `
      <span class="${escapeHtml(
        className
      )} alternative-names-block ${escapeHtml(
        modifier
      )}">
        <span class="alternative-names-label">
          ${escapeHtml(label)}
        </span>
        <span class="alternative-names-list">
          ${rows
            .map(row => `
              <span class="alternative-names-line">
                ${row
                  .map(name => `
                    <span class="alternative-name">${escapeHtml(name)}</span>
                  `)
                  .join("")}
              </span>
            `)
            .join("")}
        </span>
      </span>
    `;
  };

  if (
    translationRenderings.length ||
    sourceDesignations.length
  ) {
    return [
      createNamesBlock(
        "Translation renderings",
        translationRenderings,
        "translation-renderings-block"
      ),
      createNamesBlock(
        "Designations in the source",
        sourceDesignations,
        "source-designations-block",
        3
      )
    ].join("");
  }

  return createNamesBlock(
    "Also known as",
    alternativeNames
  );
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
        <span class="pleroma-explorer-title">
          ${escapeHtml(process.explorerTitle || "Explore")}
        </span>
      </summary>

      <div class="pleromatic-process-members">
        ${entries}
        ${note}
      </div>
    </details>
  `;
}


function createMonadProvenanceMarkup(
  entity,
  database
) {
  if (
    entity?.id !== "entity-monad" ||
    !Array.isArray(entity.traditionIds)
  ) {
    return "";
  }

  const tradition =
    entity.traditionIds
      .map(traditionId =>
        database.traditions.find(
          item => item.id === traditionId
        ) || null
      )
      .find(Boolean);

  const label =
    tradition?.name || "";

  if (!label) {
    return "";
  }

  return `
    <span
      class="source-tradition-markers"
      aria-label="Source tradition: ${escapeHtml(label)}"
    >
      <span class="source-tradition-marker">
        <span
          class="source-tradition-book"
          aria-hidden="true"
        ></span>
        <span>${escapeHtml(label)}</span>
      </span>
    </span>
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

  const provenance =
    createMonadProvenanceMarkup(
      entity,
      database
    );

  return `
    <article
      class="event primary-entity${["entity-barbelo", "entity-autogenes"].includes(entity.id) ? " pleroma-atomic-card" : ""}"
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
      ${provenance}

      <span class="period">
        ${escapeHtml(phaseLabel)}
      </span>

      <h2>
        ${
          entity.id === "entity-monad"
            ? `<a
                class="entity-page-link"
                href="chronology/monad/"
                aria-label="Open the individual Monad page"
              >${escapeHtml(entity.displayName)}</a>`
            : escapeHtml(entity.displayName)
        }
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
      class="event primary-group spiritual-generations-card pleroma-atomic-card"
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
        From the foreknowledge of the perfect Mind, through the revelation of the will of the Invisible Spirit and Autogenes, the perfect heavenly Human comes forth as the first revelation and the truth. Named Pigera-Adamas and placed in the first aeon, he precedes the earthly Adam and functions within the narrative as the higher pattern of humanity from which the spiritual lineage unfolds.
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
          <span class="pleroma-explorer-title">
            Explore The Spiritual Generations
          </span>
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
      class="event primary-group twelve-aeons-group pleroma-atomic-card"
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

      ${group.contextualNote
        ? `<p class="twelve-aeons-context-note">${escapeHtml(group.contextualNote)}</p>`
        : ""}

      ${groupSources}

      ${
        domains.length
          ? `
            <details
              class="group-explorer aeon-explorer"
            >
              <summary>
                ${group.id === "group-four-luminaries"
                  ? `<span class="pleroma-explorer-title">Explore ${escapeHtml(group.displayName)}</span>`
                  : `Explore ${escapeHtml(group.displayName)}`
                }
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
      class="event primary-group${group.id === "group-four-luminaries" ? " pleroma-atomic-card" : ""}"
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
      class="event primary-event${event.id === "event-sophia-independent-generation" ? " pleroma-atomic-card" : ""}"
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

  const firstElement =
    realm?.id === "realm-pleroma"
      ? elements.find(
          element =>
            element.dataset.entityId !==
            "entity-monad"
        ) || elements[0]
      : elements[0];

  const realmCopy =
    overlay.querySelector(
      ".realm-region-copy"
    );

  const usesChapterNavigation =
    timeline.dataset.realmNavigation ===
    "true";

  if (usesChapterNavigation) {
    firstElement.classList.remove(
      "realm-start-entry"
    );

    firstElement.style.removeProperty(
      "--realm-intro-clearance"
    );

    if (realmCopy) {
      realmCopy.hidden = true;
    }
  } else {
    firstElement.classList.add(
      "realm-start-entry"
    );

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
  }

  overlay.hidden = false;

  const timelineRect =
    timeline.getBoundingClientRect();

  const chapterHeader =
    usesChapterNavigation
      ? timeline.querySelector(
          `[data-realm-navigation-card="${CSS.escape(
            realm.id
          )}"]`
        )
      : null;

  const realmIsOpen =
    Boolean(
      chapterHeader &&
      chapterHeader.classList.contains(
        "is-active"
      )
    );

  /*
    In folded navigation, the existing ambient overlay becomes the
    realm's own header field. When opened, the same overlay simply
    extends downward through the original chronology content.
  */
  if (
    usesChapterNavigation &&
    chapterHeader
  ) {
    const headerRect =
      chapterHeader.getBoundingClientRect();

    const topPosition =
      headerRect.top -
      timelineRect.top;

    let bottomPosition =
      headerRect.bottom -
      timelineRect.top;

    if (realmIsOpen) {
      const visibleSequenceCards =
        Array.from(
          timeline.querySelectorAll(
            `[data-sequence-realm-id="${CSS.escape(
              realm.id
            )}"]`
          )
        ).filter(
          card =>
            !card.hidden &&
            window.getComputedStyle(
              card
            ).display !== "none"
        );

      const visibleElementRects = [
        ...elements.filter(
          element =>
            !element.hidden &&
            window.getComputedStyle(
              element
            ).display !== "none"
        ),
        ...visibleSequenceCards
      ].map(
        element =>
          element.getBoundingClientRect()
      );

      if (visibleElementRects.length) {
        bottomPosition =
          Math.max(
            ...visibleElementRects.map(
              rect => rect.bottom
            )
          ) -
          timelineRect.top;
      }
    }

    overlay.style.top =
      `${Math.max(
        0,
        topPosition
      )}px`;

    overlay.style.height =
      `${Math.max(
        0,
        bottomPosition -
        topPosition
      )}px`;

    return;
  }

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

  if (realm?.id === "realm-pleroma") {
    const thresholdNode =
      timeline.querySelector(
        ".pleroma-threshold-node"
      );

    if (thresholdNode) {
      const thresholdRect =
        thresholdNode
          .getBoundingClientRect();

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
    Math.max(0, topPosition);

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
   INLINE REALM CHAPTER NAVIGATION
   ========================================================== */

/*
  Chapter navigation stays separate from ontological realm scope.
  Headers are inserted directly before their original flat content,
  so opening a chapter pushes every following closed header downward
  without moving or recreating chronology cards.
*/
function getRealmNavigationEntryIds(realm) {
  return Array.isArray(
    realm?.navigationScope?.entryIds
  )
    ? realm.navigationScope.entryIds
    : [];
}

function getRealmChronologicalSequences(
  realm
) {
  return Array.isArray(
    realm?.chronologicalSequences
  )
    ? realm.chronologicalSequences
    : [];
}

function getSequenceEntryIds(
  sequence
) {
  return Array.isArray(
    sequence?.entryIds
  )
    ? sequence.entryIds
    : [];
}

function createSequenceSubtitleMarkup(
  subtitle,
  realmId
) {
  if (!subtitle) {
    return "";
  }

  if (realmId !== "realm-pleroma") {
    return escapeHtml(subtitle);
  }

  const units =
    subtitle
      .split(/\s*,\s*/)
      .filter(Boolean);

  if (units.length <= 1) {
    return `
      <span class="sequence-subtitle-unit">
        ${escapeHtml(subtitle)}
      </span>
    `;
  }

  return units
    .map((unit, index) => `
      <span class="sequence-subtitle-unit">
        ${escapeHtml(unit)}${index < units.length - 1 ? "," : ""}
      </span>
    `)
    .join(" ");
}


function createSequenceNavigationMarkup(
  sequence,
  realmId
) {
  const label =
    sequence.display?.label ||
    "Sequence";

  const title =
    sequence.displayName || "";

  const subtitle =
    sequence.subtitle || "";

  return `
    <section
      class="sequence-navigation-card"
      data-sequence-navigation-card="${escapeHtml(
        sequence.id
      )}"
      data-sequence-realm-id="${escapeHtml(
        realmId
      )}"
      hidden
    >
      <button
        class="sequence-navigation-toggle"
        type="button"
        aria-expanded="false"
        data-sequence-navigation-toggle="${escapeHtml(
          sequence.id
        )}"
      >
        <span class="sequence-navigation-copy">
          <span class="sequence-navigation-kicker">
            ${escapeHtml(label)}
          </span>

          <span class="sequence-navigation-name">
            ${escapeHtml(title)}
          </span>

          ${subtitle
            ? `
              <span class="sequence-navigation-subtitle">
                ${createSequenceSubtitleMarkup(
                  subtitle,
                  realmId
                )}
              </span>
            `
            : ""
          }
        </span>

        <span
          class="sequence-navigation-action"
          aria-hidden="true"
        >
          <span class="sequence-navigation-action-label">
            Explore Sequence
          </span>
          <span class="sequence-navigation-symbol">↓</span>
        </span>
      </button>
    </section>
  `;
}


function createRealmNavigationMarkup(
  chapter
) {
  const chapterName =
    chapter.display?.label ||
    chapter.displayName ||
    "";

  const subtitle =
    chapter.display?.subtitle || "";

  const navigationKicker =
    chapter.id === "chapter-monad"
      ? ""
      : (
          chapter.navigationKicker ||
          "Realm"
        );

  return `
    <section
      class="realm-navigation-card"
      data-realm-navigation-card="${escapeHtml(
        chapter.id
      )}"
    >
      <button
        class="realm-navigation-toggle"
        type="button"
        aria-expanded="false"
        data-realm-navigation-toggle="${escapeHtml(
          chapter.id
        )}"
      >
        <span class="realm-navigation-copy">
          ${navigationKicker
            ? `
              <span class="realm-navigation-kicker">
                ${escapeHtml(navigationKicker)}
              </span>
            `
            : ""
          }

          <span class="realm-navigation-name">
            ${escapeHtml(chapterName)}
          </span>

          ${subtitle
            ? `
              <span class="realm-navigation-subtitle">
                ${escapeHtml(subtitle)}
              </span>
            `
            : ""
          }

          ${(
            Array.isArray(
              chapter.summaryLines
            ) &&
            chapter.summaryLines.length
          )
            ? `
              <span class="realm-navigation-summary">
                ${chapter.summaryLines
                  .map(
                    line => `
                      <span class="realm-navigation-summary-line">
                        ${escapeHtml(line)}
                      </span>
                    `
                  )
                  .join("")}
              </span>
            `
            : chapter.summary
              ? `
                <span class="realm-navigation-summary">
                  ${escapeHtml(
                    chapter.summary
                  )}
                </span>
              `
              : ""
          }
        </span>

        <span
          class="realm-navigation-action"
          aria-hidden="true"
        >
          <span class="realm-navigation-action-label">
            ${chapter.id === "chapter-monad"
              ? "Explore Monad"
              : "Explore Realm"}
          </span>
          <span class="realm-navigation-symbol">↓</span>
        </span>
      </button>
    </section>
  `;
}

function initializeRealmNavigation(
  timeline,
  timelineItems,
  database,
  synchronizeTimelineCardSides,
  updateTimelineStart
) {
  const monad =
    database.entities.find(
      entity =>
        entity.id === "entity-monad"
    ) || null;

  const realms =
    database.realms.filter(
      realm =>
        realm.display?.mode ===
          "ambient-region" &&
        getRealmNavigationEntryIds(
          realm
        ).length
    );

  if (!monad || !realms.length) {
    return;
  }

  const monadChapter = {
    id: "chapter-monad",
    displayName: monad.displayName,
    navigationKicker: "",
    summaryLines: [
      "The Monad is sovereign, with nothing above it.",
      "It is God and Parent, the Father of the All."
    ],
    display: {
      label: monad.displayName,
      subtitle: "THE INVISIBLE SPIRIT"
    },
    navigationScope: {
      entryIds: ["entity-monad"]
    }
  };

  const chapters = [
    monadChapter,
    ...realms
  ];

  const sequences =
    realms
      .filter(realm => realm.id === "realm-pleroma")
      .flatMap(
      realm =>
        getRealmChronologicalSequences(
          realm
        ).map(sequence => ({
          ...sequence,
          realmId: realm.id
        }))
    );

  const sequenceById =
    new Map(
      sequences.map(
        sequence => [
          sequence.id,
          sequence
        ]
      )
    );

  const navigationEntryIds =
    new Set(
      chapters.flatMap(
        getRealmNavigationEntryIds
      )
    );

  const elementByEntryId =
    new Map();

  timelineItems.forEach(entry => {
    const entryId =
      getTimelineEntryId(entry);

    const element =
      getTimelineElementForEntry(
        timeline,
        entry
      );

    if (entryId && element) {
      elementByEntryId.set(
        entryId,
        element
      );
    }
  });

  chapters.forEach(chapter => {
    const firstEntryId =
      getRealmNavigationEntryIds(
        chapter
      )[0];

    let anchor =
      elementByEntryId.get(
        firstEntryId
      ) || null;

    if (
      chapter.id ===
        "realm-pleroma"
    ) {
      anchor =
        timeline.querySelector(
          ".pleroma-threshold"
        ) || anchor;
    }

    if (!anchor) {
      return;
    }

    anchor.insertAdjacentHTML(
      "beforebegin",
      createRealmNavigationMarkup(
        chapter
      )
    );
  });

  sequences.forEach(sequence => {
    const firstEntryId =
      getSequenceEntryIds(
        sequence
      )[0];

    let anchor =
      elementByEntryId.get(
        firstEntryId
      ) || null;

    /*
      The first unfolding is the threshold of Barbelo's sequence,
      not a free-standing marker between the realm and its chapters.
    */
    if (
      sequence.id ===
        "sequence-pleroma-first-emanations"
    ) {
      anchor =
        timeline.querySelector(
          ".pleroma-threshold"
        ) || anchor;
    }

    if (!anchor) {
      return;
    }

    anchor.insertAdjacentHTML(
      "beforebegin",
      createSequenceNavigationMarkup(
        sequence,
        sequence.realmId
      )
    );
  });

  const sequenceCards =
    Array.from(
      timeline.querySelectorAll(
        ".sequence-navigation-card"
      )
    );

  const chapterCards =
    Array.from(
      timeline.querySelectorAll(
        ".realm-navigation-card"
      )
    );

  if (!chapterCards.length) {
    return;
  }

  const monadChapterCard =
    chapterCards.find(
      card =>
        card.dataset
          .realmNavigationCard ===
        "chapter-monad"
    ) || null;

  const monadEntry =
    elementByEntryId.get(
      "entity-monad"
    ) || null;

  const monadRegion =
    document.createElement(
      "div"
    );

  monadRegion.className =
    "monad-region";

  timeline.prepend(
    monadRegion
  );

  const positionMonadRegion = () => {
    if (!monadChapterCard) {
      monadRegion.hidden = true;
      return;
    }

    monadRegion.hidden = false;

    const timelineRect =
      timeline.getBoundingClientRect();

    const headerRect =
      monadChapterCard
        .getBoundingClientRect();

    const topPosition =
      headerRect.top -
      timelineRect.top;

    let bottomPosition =
      headerRect.bottom -
      timelineRect.top;

    if (
      monadChapterCard.classList.contains(
        "is-active"
      ) &&
      monadEntry &&
      !monadEntry.hidden
    ) {
      bottomPosition =
        Math.max(
          bottomPosition,
          monadEntry
            .getBoundingClientRect()
            .bottom -
          timelineRect.top
        );
    }

    monadRegion.style.top =
      `${Math.max(
        0,
        topPosition
      )}px`;

    monadRegion.style.height =
      `${Math.max(
        0,
        bottomPosition -
        topPosition
      )}px`;
  };

  timeline.dataset.realmNavigation =
    "true";
  timeline.dataset.hasOpenRealm =
    "false";
  timeline.dataset.openChapterIds =
    "";
  timeline.dataset.openSequenceIds =
    "";

  const openChapterIds =
    new Set();

  const openSequenceIds =
    new Set();

  function applyRealmSelection(
    requestedChapterId
  ) {
    /*
      Every chapter owns its own fold state. Keeping already opened
      chapters in the document prevents content above the selected
      header from disappearing and therefore removes scroll jumps
      during chronological navigation.
    */
    if (requestedChapterId) {
      if (
        openChapterIds.has(
          requestedChapterId
        )
      ) {
        openChapterIds.delete(
          requestedChapterId
        );
      } else {
        openChapterIds.add(
          requestedChapterId
        );
      }
    }

    timeline.dataset.openChapterIds =
      Array.from(
        openChapterIds
      ).join(" ");

    timeline.dataset.openSequenceIds =
      Array.from(
        openSequenceIds
      ).join(" ");

    const activeEntryIds =
      new Set();

    chapters
      .filter(
        chapter =>
          openChapterIds.has(
            chapter.id
          )
      )
      .forEach(chapter => {
        const chapterSequences =
          getRealmChronologicalSequences(
            chapter
          );

        if (!chapterSequences.length) {
          getRealmNavigationEntryIds(
            chapter
          ).forEach(
            entryId =>
              activeEntryIds.add(
                entryId
              )
          );
          return;
        }

        chapterSequences
          .filter(
            sequence =>
              openSequenceIds.has(
                sequence.id
              )
          )
          .forEach(
            sequence =>
              getSequenceEntryIds(
                sequence
              ).forEach(
                entryId =>
                  activeEntryIds.add(
                    entryId
                  )
              )
          );
      });

    timeline.dataset.hasOpenRealm =
      String(
        Array.from(
          activeEntryIds
        ).some(
          entryId =>
            entryId !== "entity-monad"
        )
      );

    timelineItems.forEach(entry => {
      const entryId =
        getTimelineEntryId(entry);

      if (
        !navigationEntryIds.has(entryId)
      ) {
        return;
      }

      const element =
        elementByEntryId.get(
          entryId
        );

      if (element) {
        element.hidden =
          !activeEntryIds.has(entryId);
      }
    });

    sequenceCards.forEach(card => {
      const sequenceId =
        card.dataset
          .sequenceNavigationCard ||
        "";

      const realmId =
        card.dataset
          .sequenceRealmId ||
        "";

      const realmIsOpen =
        openChapterIds.has(
          realmId
        );

      const isActive =
        realmIsOpen &&
        openSequenceIds.has(
          sequenceId
        );

      card.hidden =
        !realmIsOpen;

      card.classList.toggle(
        "is-active",
        isActive
      );

      const button =
        card.querySelector(
          ".sequence-navigation-toggle"
        );

      const actionLabel =
        card.querySelector(
          ".sequence-navigation-action-label"
        );

      const symbol =
        card.querySelector(
          ".sequence-navigation-symbol"
        );

      if (button) {
        button.setAttribute(
          "aria-expanded",
          String(isActive)
        );
      }

      if (actionLabel) {
        actionLabel.textContent =
          isActive
            ? "Close Sequence"
            : "Explore Sequence";
      }

      if (symbol) {
        symbol.textContent =
          isActive ? "↑" : "↓";
      }
    });

    const pleromaThreshold =
      timeline.querySelector(
        ".pleroma-threshold"
      );

    if (pleromaThreshold) {
      pleromaThreshold.hidden =
        !openChapterIds.has(
          "realm-pleroma"
        ) ||
        !openSequenceIds.has(
          "sequence-pleroma-first-emanations"
        );
    }

    chapterCards.forEach(card => {
      const chapterId =
        card.dataset
          .realmNavigationCard ||
        "";

      const isActive =
        openChapterIds.has(
          chapterId
        );

      card.classList.toggle(
        "is-active",
        isActive
      );

      const button =
        card.querySelector(
          ".realm-navigation-toggle"
        );

      const actionLabel =
        card.querySelector(
          ".realm-navigation-action-label"
        );

      const symbol =
        card.querySelector(
          ".realm-navigation-symbol"
        );

      if (button) {
        button.setAttribute(
          "aria-expanded",
          String(isActive)
        );
      }

      if (actionLabel) {
        actionLabel.textContent =
          isActive
            ? (
                chapterId ===
                "chapter-monad"
                  ? "Close Monad"
                  : "Close Realm"
              )
            : (
                chapterId ===
                "chapter-monad"
                  ? "Explore Monad"
                  : "Explore Realm"
              );
      }

      if (symbol) {
        symbol.textContent =
          isActive ? "↑" : "↓";
      }
    });

    /*
      There is deliberately no scrollTo here. The clicked header
      remains the browser's stable visual anchor while its own
      chronology is revealed or folded beneath it.
    */
    requestAnimationFrame(() => {
      synchronizeTimelineCardSides();
      positionMonadRegion();
      updateTimelineStart();

      window.dispatchEvent(
        new Event("resize")
      );
    });
  }

  chapterCards
    .map(card =>
      card.querySelector(
        ".realm-navigation-toggle"
      )
    )
    .filter(Boolean)
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          applyRealmSelection(
            button.dataset
              .realmNavigationToggle ||
            ""
          );
        }
      );
    });

  sequenceCards
    .map(card =>
      card.querySelector(
        ".sequence-navigation-toggle"
      )
    )
    .filter(Boolean)
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const sequenceId =
            button.dataset
              .sequenceNavigationToggle ||
            "";

          const sequence =
            sequenceById.get(
              sequenceId
            );

          if (
            !sequence ||
            !openChapterIds.has(
              sequence.realmId
            )
          ) {
            return;
          }

          if (
            openSequenceIds.has(
              sequenceId
            )
          ) {
            openSequenceIds.delete(
              sequenceId
            );
          } else {
            openSequenceIds.add(
              sequenceId
            );
          }

          applyRealmSelection("");
        }
      );
    });

  applyRealmSelection("");

  window.addEventListener(
    "resize",
    () => {
      requestAnimationFrame(
        positionMonadRegion
      );
    },
    {
      passive: true
    }
  );

  if (monadEntry) {
    monadEntry
      .querySelectorAll("details")
      .forEach(details => {
        details.addEventListener(
          "toggle",
          () => {
            requestAnimationFrame(
              positionMonadRegion
            );
          }
        );
      });
  }
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

    const usesChapterNavigation =
      timeline.dataset.realmNavigation ===
      "true";

    let axisStart;

    if (usesChapterNavigation) {
      const pleromaIsOpen =
        timeline
          .querySelector(
            '[data-realm-navigation-card="realm-pleroma"]'
          )
          ?.classList.contains(
            "is-active"
          );

      if (
        pleromaIsOpen &&
        thresholdNode &&
        thresholdNode.offsetParent
      ) {
        axisStart =
          thresholdNode.offsetParent.offsetTop +
          thresholdNode.offsetTop +
          thresholdNode.offsetHeight / 2;
      } else {
        const firstVisibleEvent =
          Array.from(
            timeline.querySelectorAll(
              ".event"
            )
          ).find(
            eventElement =>
              !eventElement.hidden &&
              window.getComputedStyle(
                eventElement
              ).display !== "none"
          );

        axisStart =
          firstVisibleEvent
            ? firstVisibleEvent.offsetTop +
              70
            : monad.offsetTop +
              monad.offsetHeight;
      }
    } else {
      axisStart =
        mobilePleromaStart
          ? mobilePleromaStart.offsetTop
          : thresholdNode &&
              thresholdNode.offsetParent
            ? thresholdNode.offsetParent.offsetTop +
              thresholdNode.offsetTop +
              thresholdNode.offsetHeight / 2
            : monad.offsetTop +
              monad.offsetHeight;
    }

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

    const axisLength = Math.max(
      0,
      axisEnd - axisStart
    );

    timeline.style.setProperty(
      "--timeline-length",
      `${axisLength}px`
    );

    const eventAxisPosition =
      eventId => {
        const eventElement =
          timeline.querySelector(
            `[data-event-id="${eventId}"]`
          );

        if (
          !eventElement ||
          eventElement.hidden ||
          window.getComputedStyle(eventElement).display === "none"
        ) {
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

    const realmAxisPosition =
      realmId => {
        const realmRegion =
          timeline.querySelector(
            `.realm-region[data-realm-id="${CSS.escape(
              realmId
            )}"]`
          );

        if (
          !realmRegion ||
          realmRegion.hidden ||
          window.getComputedStyle(realmRegion).display === "none"
        ) {
          return null;
        }

        const timelineRect =
          timeline.getBoundingClientRect();

        const realmRect =
          realmRegion.getBoundingClientRect();

        return Math.max(
          0,
          realmRect.top -
            timelineRect.top -
            axisStart
        );
      };

    [
      "--axis-rupture-fade",
      "--axis-rupture",
      "--axis-demiurgic-fade",
      "--axis-demiurgic",
      "--axis-material-fade",
      "--axis-material",
      "--axis-primordial-fade",
      "--axis-primordial"
    ].forEach(propertyName =>
      timeline.style.removeProperty(propertyName)
    );

    const rupturePosition =
      eventAxisPosition(
        "event-sophia-independent-generation"
      );

    const demiurgicPosition =
      realmAxisPosition(
        "realm-demiurgic-order"
      ) ??
      eventAxisPosition(
        "event-yaldabaoth-emergence"
      );

    const materialPosition =
      realmAxisPosition(
        "realm-material-cosmos"
      ) ??
      eventAxisPosition(
        "event-ordering-material-cosmos"
      );

    const primordialHumanityPosition =
      realmAxisPosition(
        "realm-primordial-humanity"
      ) ??
      eventAxisPosition(
        "event-adam-archontic-paradise"
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

    const realmAxisFadeLength = 120;

    if (demiurgicPosition !== null) {
      timeline.style.setProperty(
        "--axis-demiurgic-fade",
        `${demiurgicPosition}px`
      );

      timeline.style.setProperty(
        "--axis-demiurgic",
        `${demiurgicPosition + realmAxisFadeLength}px`
      );
    }

    if (materialPosition !== null) {
      timeline.style.setProperty(
        "--axis-material-fade",
        `${materialPosition}px`
      );

      timeline.style.setProperty(
        "--axis-material",
        `${materialPosition + realmAxisFadeLength}px`
      );
    }

    if (primordialHumanityPosition !== null) {
      timeline.style.setProperty(
        "--axis-primordial-fade",
        `${primordialHumanityPosition}px`
      );

      timeline.style.setProperty(
        "--axis-primordial",
        `${primordialHumanityPosition + realmAxisFadeLength}px`
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

  initializeRealmNavigation(
    timeline,
    timelineItems,
    database,
    synchronizeTimelineCardSides,
    updateTimelineStart
  );

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

function scrollChronologyToStart(
  timeline,
  behavior
) {
  /*
    The research note remains fixed above the document on both
    desktop and mobile. Reserve its full rendered height plus a
    deliberate breathing space, so the complete Monad chapter
    header is never clipped against the top edge on entry.
  */
  const researchNote =
    document.querySelector(
      ".research-note"
    );

  const fixedHeaderInset =
    researchNote
      ? Math.max(
          0,
          researchNote
            .getBoundingClientRect()
            .bottom
        )
      : 0;

  const entryClearance = 20;

  const timelineTop =
    window.scrollY +
    timeline
      .getBoundingClientRect()
      .top;

  window.scrollTo({
    top: Math.max(
      0,
      timelineTop -
      fixedHeaderInset -
      entryClearance
    ),
    left: 0,
    behavior
  });
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
          scrollChronologyToStart(
            timeline,
            reduceMotion
              ? "auto"
              : "smooth"
          );
        });
      });
    }
  );
}

initializeChronologyEntry();
renderTimeline();
