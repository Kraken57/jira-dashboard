import type { RawFeedPayload } from "@/lib/jira/types";
import { buildReportSheets, type ReportSheetData } from "./excelReport";

const REPORT_SCOPE = "All Pods · All Quarters / PIs · All Sprints · All Sprint Statuses";

function addSheet(workbook: import("exceljs").Workbook, data: ReportSheetData, scope: string, generatedAt: Date, snapshotAt: Date) {
  const sheet = workbook.addWorksheet(data.name, {
    views: [{ state: "frozen", ySplit: 5, xSplit: data.name === "Velocity" ? 3 : 0 }],
    properties: { defaultRowHeight: 22, tabColor: { argb: "FF2864A5" } },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const lastColumn = Math.max(1, data.headers.length);
  const lastColumnLetter = sheet.getColumn(lastColumn).letter;

  sheet.mergeCells(`A1:${lastColumnLetter}1`);
  sheet.getCell("A1").value = data.name;
  sheet.getCell("A1").font = { name: "Aptos Display", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B63" } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 34;

  sheet.mergeCells(`A2:${lastColumnLetter}2`);
  sheet.getCell("A2").value = `Report scope: ${scope}`;
  sheet.getCell("A2").font = { name: "Aptos", size: 10, color: { argb: "FF334155" }, bold: true };
  sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1F8" } };
  sheet.getRow(2).height = 24;

  sheet.mergeCells(`A3:${lastColumnLetter}3`);
  sheet.getCell("A3").value = data.description;
  sheet.getCell("A3").font = { name: "Aptos", size: 10, italic: true, color: { argb: "FF526477" } };
  sheet.getCell("A3").alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(3).height = Math.max(30, Math.ceil(data.description.length / Math.max(70, lastColumn * 16)) * 15);

  sheet.mergeCells(`A4:${lastColumnLetter}4`);
  sheet.getCell("A4").value = `Generated ${generatedAt.toLocaleString("en-US")} · Jira snapshot ${snapshotAt.toLocaleString("en-US")}`;
  sheet.getCell("A4").font = { name: "Aptos", size: 9, color: { argb: "FF64748B" } };
  sheet.getRow(4).height = 20;

  const header = sheet.addRow(data.headers);
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF205B8F" } };
    cell.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF123B63" } } };
  });

  const firstDataRow = 6;
  const summaryRows = new Set(data.summaryRows || []);
  if (data.rows.length === 0) {
    const empty = sheet.addRow(["No rows are available in the loaded Jira data."]);
    sheet.mergeCells(`A${firstDataRow}:${lastColumnLetter}${firstDataRow}`);
    empty.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
  } else {
    data.rows.forEach((values, index) => {
      const row = sheet.addRow(values.map((value) => value === null ? "N/A" : value));
      const isSummary = summaryRows.has(index);
      row.height = 24;
      row.eachCell((cell, columnNumber) => {
        cell.font = { name: "Aptos", size: 10, bold: isSummary || columnNumber === 1, color: { argb: isSummary ? "FF123B63" : "FF263849" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isSummary ? "FFDCEAF6" : index % 2 ? "FFF4F7FA" : "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", horizontal: columnNumber === 1 ? "left" : "center", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: "FFD8E1EA" } } };
        const dataColumn = columnNumber - 1;
        if (typeof values[dataColumn] === "number") {
          if (data.percentColumns?.includes(dataColumn)) cell.numFmt = '0.0"%"';
          else if (data.decimalColumns?.includes(dataColumn)) cell.numFmt = "#,##0.0;[Red]-#,##0.0;0";
          else cell.numFmt = "#,##0;[Red]-#,##0;0";
        }
        if (cell.value === "N/A") cell.font = { ...cell.font, color: { argb: "FF64748B" }, italic: true };
      });
      if (isSummary) row.height = 28;
    });
  }

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: lastColumn } };
  data.headers.forEach((heading, index) => {
    const values = data.rows.map((row) => String(row[index] ?? ""));
    const longest = Math.max(heading.length, ...values.map((value) => Math.min(value.length, 48)));
    const width = index === 0 ? 23 : Math.max(14, Math.min(34, longest + 3));
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width || 18, 22);
  sheet.headerFooter.oddFooter = "&LEnterprise Sprint Performance Dashboard&CInternal report&RPage &P of &N";
}

export async function downloadExcelReport(feed: RawFeedPayload) {
  const [{ default: ExcelJS }, { buildReportSheets }] = await Promise.all([
    import("exceljs"),
    import("./excelReport"),
  ]);
  const sheets = buildReportSheets(feed);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Enterprise Sprint Performance Dashboard";
  workbook.subject = "Jira sprint delivery report";
  workbook.title = "Jira Dashboard Report";
  workbook.company = "CDK Global";
  workbook.created = new Date();
  const generatedAt = new Date();
  sheets.forEach((sheet) => addSheet(workbook, sheet, REPORT_SCOPE, generatedAt, new Date(feed.fetchedAt)));
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jira-dashboard-report-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
