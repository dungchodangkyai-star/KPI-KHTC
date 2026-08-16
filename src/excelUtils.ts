import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface ExportColumn {
  header: string;
  key: string;
  width: number;
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
  top: { style: 'thin', color: { argb: 'CCCCCC' } },
  left: { style: 'thin', color: { argb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
  right: { style: 'thin', color: { argb: 'CCCCCC' } }
};

export const exportStyledExcel = async (
  data: any[], 
  columns: ExportColumn[], 
  filename: string, 
  sheetName = 'Data'
) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }] // freeze header
  });

  ws.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width
  }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = CELL_BORDER;
  });

  // Add data
  for (const rowData of data) {
    const row = ws.addRow(rowData);
    row.eachCell((cell) => {
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: 'middle' };
    });
  }

  // Protect sheet if it's a template
  // If it's just an export, we won't protect. If we want a template, we can pass a flag.

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
};

export const downloadStyledTemplate = async (
  templateData: any[],
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Template'
) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  ws.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width
  }));

  // Style header
  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = CELL_BORDER;
    // We lock headers
    cell.protection = { locked: true };
  });

  // Add sample data but we don't strictly lock the data rows so they can replace them.
  // Actually, standard excel JS protection locks everything by default unless locked: false.
  // So we can lock the worksheet, but unlock the columns/rows below header.
  
  for (const rowData of templateData) {
    const row = ws.addRow(rowData);
    row.eachCell((cell) => {
      cell.border = CELL_BORDER;
      cell.alignment = { vertical: 'middle' };
      cell.font = { italic: true, color: { argb: '666666' } };
      cell.protection = { locked: false };
    });
  }

  // Add extra 100 rows of unlocked cells so users can paste data
  for(let i = 0; i < 100; i++) {
    const row = ws.addRow({});
    for(let col = 1; col <= columns.length; col++) {
      const cell = row.getCell(col);
      cell.border = CELL_BORDER;
      cell.protection = { locked: false };
    }
  }

  // Protect worksheet
  await ws.protect('password123', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: true,
    deleteColumns: false,
    deleteRows: true,
  });

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename);
};
