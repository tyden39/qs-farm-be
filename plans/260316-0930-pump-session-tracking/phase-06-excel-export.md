# Phase 6: Excel Export

## Context Links

- [Phase 5: Report API](./phase-05-report-api.md) -- report data to reuse
- [PumpController](../../src/pump/pump.controller.ts) -- already handles `format=excel`
- [package.json](../../package.json) -- add exceljs dependency

## Overview

- **Priority:** P3
- **Status:** completed
- **Description:** Install exceljs, implement `getReportExcel()` in PumpService. Two sheets: "Pump Sessions" (session rows + footer totals) and "Maintenance" (conditional, shown when maintenanceInfo.isWarning is true).

## Key Insights

- exceljs is the standard Node.js Excel library. Lightweight, no native deps, supports streaming.
- Controller already handles `format=excel`: sets Content-Type and Content-Disposition headers, calls `pumpService.getReportExcel()`, sends buffer. No controller changes needed.
- Reuse `getReport()` to get all data, then format into Excel. DRY -- no duplicate queries.
- Buffer output via `workbook.xlsx.writeBuffer()` -- no temp files.

## Requirements

**Functional:**
- Sheet "Pump Sessions": header row, one row per session, footer row with totals
- Columns: Session #, Start, End, Duration (min), Temp Min, Temp Max, Pressure Min, Pressure Max, Flow Total, Current Max, Overcurrent, Phase Count, Alert, Status
- Footer row: totals for duration, flow; max for current; count for overcurrent sessions
- Sheet "Maintenance" (only if isWarning or isRequired): device operating life info, usage percent, recommendation text

**Non-functional:**
- Buffer returned (not streamed to file)
- Column widths auto-set for readability

## Related Code Files

**Modify:**
- `package.json` -- add exceljs
- `src/pump/pump.service.ts` -- implement getReportExcel

## Implementation Steps

### Step 1: Install exceljs

```bash
yarn add exceljs
```

### Step 2: Implement getReportExcel in PumpService

Replace the placeholder in `src/pump/pump.service.ts`:

```typescript
import * as ExcelJS from 'exceljs';

async getReportExcel(
  deviceId: string,
  query: PumpReportQueryDto,
): Promise<Buffer> {
  const report = await this.getReport(deviceId, query);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QS Farm';
  workbook.created = new Date();

  // --- Sheet 1: Pump Sessions ---
  this.buildSessionsSheet(workbook, report);

  // --- Sheet 2: Maintenance (conditional) ---
  if (report.maintenanceInfo?.isWarning || report.maintenanceInfo?.isRequired) {
    this.buildMaintenanceSheet(workbook, report.maintenanceInfo);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}
```

### Step 3: Implement buildSessionsSheet

```typescript
private buildSessionsSheet(
  workbook: ExcelJS.Workbook,
  report: any,
) {
  const sheet = workbook.addWorksheet('Pump Sessions');

  // Column definitions
  sheet.columns = [
    { header: 'Session #', key: 'sessionNumber', width: 12 },
    { header: 'Start', key: 'startedAt', width: 20 },
    { header: 'End', key: 'endedAt', width: 20 },
    { header: 'Duration (min)', key: 'duration', width: 15 },
    { header: 'Temp Min', key: 'tempMin', width: 12 },
    { header: 'Temp Max', key: 'tempMax', width: 12 },
    { header: 'Pressure Min', key: 'pressureMin', width: 14 },
    { header: 'Pressure Max', key: 'pressureMax', width: 14 },
    { header: 'Flow Total', key: 'flowTotal', width: 12 },
    { header: 'Current Max', key: 'currentMax', width: 13 },
    { header: 'Overcurrent', key: 'overcurrent', width: 13 },
    { header: 'Phase Count', key: 'phaseCount', width: 13 },
    { header: 'Alert', key: 'hasAlert', width: 8 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  // Data rows
  for (const session of report.sessions) {
    sheet.addRow({
      sessionNumber: session.sessionNumber,
      startedAt: session.startedAt
        ? new Date(session.startedAt).toLocaleString('vi-VN')
        : '',
      endedAt: session.endedAt
        ? new Date(session.endedAt).toLocaleString('vi-VN')
        : '',
      duration: session.durationSeconds
        ? +(session.durationSeconds / 60).toFixed(1)
        : '',
      tempMin: session.tempMin ?? '',
      tempMax: session.tempMax ?? '',
      pressureMin: session.pressureMin ?? '',
      pressureMax: session.pressureMax ?? '',
      flowTotal: session.flowTotal ?? '',
      currentMax: session.currentMax ?? '',
      overcurrent: session.overcurrentDetected ? `Yes (${session.overcurrentCount})` : 'No',
      phaseCount: session.phaseCount ?? '',
      hasAlert: session.hasAlert ? 'Yes' : 'No',
      status: session.status,
    });
  }

  // Footer row with totals
  const { summary } = report;
  const footerRow = sheet.addRow({
    sessionNumber: 'TOTAL',
    startedAt: `${summary.totalSessions} sessions`,
    endedAt: '',
    duration: +(summary.totalDurationHours * 60).toFixed(1),
    tempMin: summary.tempRange?.min ?? '',
    tempMax: summary.tempRange?.max ?? '',
    pressureMin: summary.pressureRange?.min ?? '',
    pressureMax: summary.pressureRange?.max ?? '',
    flowTotal: summary.totalFlow,
    currentMax: summary.currentRange?.max ?? '',
    overcurrent: `${summary.overcurrentSessions} sessions`,
    phaseCount: '',
    hasAlert: '',
    status: '',
  });

  footerRow.font = { bold: true };
  footerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' },
  };
}
```

### Step 4: Implement buildMaintenanceSheet

```typescript
private buildMaintenanceSheet(
  workbook: ExcelJS.Workbook,
  info: any,
) {
  const sheet = workbook.addWorksheet('Maintenance');

  sheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 30 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  sheet.addRow({ field: 'Operating Life (hours)', value: info.operatingLifeHours });
  sheet.addRow({ field: 'Total Operating Hours', value: info.totalOperatingHours });
  sheet.addRow({ field: 'Usage (%)', value: `${info.usagePercent}%` });
  sheet.addRow({ field: 'Warning Threshold', value: `${info.warningThreshold}%` });

  const statusRow = sheet.addRow({
    field: 'Status',
    value: info.isRequired
      ? 'MAINTENANCE REQUIRED'
      : info.isWarning
        ? 'MAINTENANCE WARNING'
        : 'OK',
  });

  if (info.isRequired) {
    statusRow.getCell('value').font = { bold: true, color: { argb: 'FFFF0000' } };
  } else if (info.isWarning) {
    statusRow.getCell('value').font = { bold: true, color: { argb: 'FFFF8C00' } };
  }

  sheet.addRow({});
  sheet.addRow({
    field: 'Recommendation',
    value: info.isRequired
      ? 'Device has exceeded operating life. Schedule maintenance immediately.'
      : 'Device is approaching operating life limit. Plan maintenance soon.',
  });
}
```

### Step 5: Verify build

```bash
yarn build
```

## Todo List

- [ ] Run `yarn add exceljs`
- [ ] Import ExcelJS in `pump.service.ts`
- [ ] Replace `getReportExcel()` placeholder with real implementation
- [ ] Implement `buildSessionsSheet()` with header, data rows, footer
- [ ] Implement `buildMaintenanceSheet()` with conditional display
- [ ] Run `yarn build` to verify compilation
- [ ] Manual test: call `GET /api/pump/report/:deviceId?format=excel`, open downloaded .xlsx

## Success Criteria

- `GET /api/pump/report/:deviceId?format=excel` returns a valid .xlsx file
- "Pump Sessions" sheet contains all sessions with correct data
- Footer row shows correct totals
- "Maintenance" sheet appears ONLY when isWarning or isRequired is true
- Status cell is red for REQUIRED, orange for WARNING
- File opens correctly in Excel / Google Sheets / LibreOffice

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| exceljs adds bundle size | Low | ~2MB, acceptable for server-side |
| Large session count (1000+) makes big file | Low | Sessions are limited to 100 in getSessions(); for full export a separate endpoint could be added later (YAGNI) |
| Date formatting locale | Low | Using `vi-VN` locale to match existing Vietnamese labels in codebase |
| ExcelJS types not found | Low | exceljs ships its own types; no @types package needed |
