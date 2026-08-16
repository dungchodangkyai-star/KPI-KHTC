sed -i "s/import { Settings/import { Download, Upload, FileDown, FileUp, Settings/g" src/pages/AdminSettings.tsx
sed -i "s/import { WORK_NATURE_COEFS/import * as XLSX from 'xlsx';\nimport { WORK_NATURE_COEFS/g" src/pages/AdminSettings.tsx
