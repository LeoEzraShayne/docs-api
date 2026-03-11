const TAB_LIMIT = 5;

function redactRow(tab: string, row: Record<string, unknown>) {
  const clone = { ...row };

  if (tab === 'functions') {
    delete clone.acceptance;
    delete clone.acceptanceCriteria;
    delete clone.exceptions;
  }

  if (tab === 'nfr') {
    delete clone.target;
    delete clone.evidence;
  }

  if (tab === 'risks_issues') {
    delete clone.countermeasure;
    delete clone.decision_point;
  }

  return clone;
}

export function redactPreviewTabs(tabs: Record<string, Record<string, unknown>[]>) {
  return Object.fromEntries(
    Object.entries(tabs).map(([tab, rows]) => [
      tab,
      rows.slice(0, TAB_LIMIT).map((row) => redactRow(tab, row)),
    ]),
  );
}
