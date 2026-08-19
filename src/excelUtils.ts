import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
}

export interface MultiSheetConfig {
  sheetName: string;
  columns: ExportColumn[];
  data: any[];
  isTemplate?: boolean;
  protectHeader?: boolean;
}

const BRAND_COLOR = '1F4E78';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: BRAND_COLOR }
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: 'FFFFFF' },
  bold: true,
  name: 'Arial',
  size: 11
};

const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'D3D3D3' } },
  left: { style: 'thin', color: { argb: 'D3D3D3' } },
  bottom: { style: 'thin', color: { argb: 'D3D3D3' } },
  right: { style: 'thin', color: { argb: 'D3D3D3' } }
};

// Auto calculate appropriate column width based on content and header length
export const calculateAutoWidths = (data: any[], columns: ExportColumn[]): ExportColumn[] => {
  return columns.map(col => {
    let maxLen = col.header ? String(col.header).length : 10;
    
    // Sample first 100 rows for performance
    const sample = data.slice(0, 100);
    for (const row of sample) {
      const val = row[col.key];
      if (val !== undefined && val !== null) {
        const strVal = String(val);
        // Multi-line support
        const longestLine = strVal.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
        if (longestLine > maxLen) {
          maxLen = longestLine;
        }
      }
    }

    // Determine width with safe bounds
    const autoW = Math.min(Math.max(maxLen + 4, col.width || 12), 65);
    return {
      ...col,
      width: col.width ? Math.max(col.width, autoW) : autoW
    };
  });
};

/**
 * Format and style a single worksheet with Brand styling (#1F4E78), frozen header, borders & cell alignment.
 */
export const styleWorksheet = (
  ws: ExcelJS.Worksheet,
  data: any[],
  columns: ExportColumn[],
  isTemplate = false,
  protectHeader = false
) => {
  // 1. Calculate auto widths
  const optimizedCols = calculateAutoWidths(data, columns);

  ws.columns = optimizedCols.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 15
  }));

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  // 2. Style Header Row
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center',
      wrapText: true 
    };
    cell.border = CELL_BORDER;
    if (protectHeader) {
      cell.protection = { locked: true };
    }
  });

  // 3. Add Data Rows
  data.forEach((rowData, rIdx) => {
    const row = ws.addRow(rowData);
    row.height = 24;

    // Apply alternating slight tint or white
    const isEven = rIdx % 2 === 1;
    const rowFill: ExcelJS.Fill | undefined = isEven ? {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F9FAFB' }
    } : undefined;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = optimizedCols[colNumber - 1];
      cell.border = CELL_BORDER;
      cell.font = {
        name: 'Arial',
        size: 10,
        italic: isTemplate && rIdx < 3
      };

      if (rowFill && (!isTemplate || rIdx >= 3)) {
        cell.fill = rowFill;
      }

      // Formatting & alignment
      const align = colDef?.align || 'left';
      cell.alignment = {
        vertical: 'middle',
        horizontal: align,
        wrapText: true
      };

      if (colDef?.numFmt) {
        cell.numFmt = colDef.numFmt;
      }

      if (isTemplate) {
        cell.protection = { locked: false };
      }
    });
  });

  // If template, add 50 extra unlocked empty rows
  if (isTemplate) {
    for (let i = 0; i < 50; i++) {
      const emptyRow = ws.addRow({});
      emptyRow.height = 22;
      for (let colIdx = 1; colIdx <= optimizedCols.length; colIdx++) {
        const cell = emptyRow.getCell(colIdx);
        cell.border = CELL_BORDER;
        cell.protection = { locked: false };
        cell.alignment = { vertical: 'middle' };
      }
    }

    ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      deleteRows: true
    });
  }
};

/**
 * Export a Single-Sheet Styled Excel file
 */
export const exportStyledExcel = async (
  data: any[],
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Data'
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý KPI & Đánh giá Công việc';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  styleWorksheet(ws, data, columns, false, false);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
};

/**
 * Export a Multi-Sheet Styled Excel file (Perfect for Full Backup & Master Templates)
 */
export const exportMultiSheetExcel = async (
  sheets: MultiSheetConfig[],
  filename: string
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý KPI & Đánh giá Công việc';
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.sheetName);
    styleWorksheet(ws, s.data, s.columns, !!s.isTemplate, !!s.protectHeader);
  }

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
};

/**
 * Download a Single-Sheet Styled Template with sample hints and unlocked data rows
 */
export const downloadStyledTemplate = async (
  templateData: any[],
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Template'
) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống Quản lý KPI';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  styleWorksheet(ws, templateData, columns, true, true);

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
};
