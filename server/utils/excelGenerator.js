/**
 * RDL Intelligence Hub - Generador Nativo de Excel y CSV
 * Produce hojas de cálculo compatibles 100% con Microsoft Excel, LibreOffice y Google Sheets
 * sin dependencias externas pesadas.
 */

// Escapar caracteres reservados para XML
function escapeXml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Genera un archivo de hoja de cálculo en formato XML Spreadsheet 2003 (.xls)
 * Reconocido nativamente por Excel como libro con estilos, anchos y tipos de datos.
 */
export function generateExcelXml(sheetName, columns, rows) {
    const sName = escapeXml(sheetName || 'Reporte RDL').substring(0, 31);

    // Definición de anchos sugeridos
    const colDefs = columns.map(c => {
        const len = Math.max(c.label.length, 12);
        const width = Math.min(Math.max(len * 8.5, 90), 300);
        return `<Column ss:AutoFitWidth="1" ss:Width="${width}"/>`;
    }).join('\n   ');

    // Fila de Encabezados
    const headerCells = columns.map(c => `
    <Cell ss:StyleID="Header">
     <Data ss:Type="String">${escapeXml(c.label)}</Data>
    </Cell>`).join('');

    // Filas de Datos
    const dataRows = rows.map((row, idx) => {
        const isZebra = idx % 2 === 1;
        const defaultStyle = isZebra ? 'ZebraText' : 'NormalText';

        const cells = columns.map(col => {
            const fieldKey = col.id || col.key;
            const rawVal = row[fieldKey];
            if (rawVal === null || rawVal === undefined || rawVal === '') {
                return `<Cell ss:StyleID="${defaultStyle}"><Data ss:Type="String">-</Data></Cell>`;
            }

            const valStr = String(rawVal).trim();

            // Status especial para Incidencias y Metas
            if (fieldKey === 'inc_estatus' || fieldKey === 'meta_estatus' || fieldKey === 'estatus_laboral') {
                const upper = valStr.toUpperCase();
                let statusStyle = defaultStyle;
                if (upper.includes('APROB') || upper === 'ACTIVO' || upper.includes('COMPLET') || upper.includes('CONCLU')) {
                    statusStyle = 'StatusAprobado';
                } else if (upper.includes('PEND') || upper.includes('PROGRESO') || upper.includes('REVISI')) {
                    statusStyle = 'StatusPendiente';
                } else if (upper.includes('RECHAZ') || upper === 'BAJA' || upper === 'INACTIVO' || upper.includes('RIESGO') || upper.includes('CANCEL')) {
                    statusStyle = 'StatusRechazado';
                }
                return `<Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(valStr)}</Data></Cell>`;
            }

            // Tipos numéricos y monetarios
            if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
                const cleanNum = parseFloat(valStr.replace(/[^\d.-]/g, ''));
                if (!isNaN(cleanNum)) {
                    let styleId = isZebra ? 'ZebraNumber' : 'NumberStyle';
                    if (col.type === 'currency') styleId = isZebra ? 'ZebraCurrency' : 'CurrencyStyle';
                    if (col.type === 'percent') styleId = isZebra ? 'ZebraPercent' : 'PercentStyle';
                    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${cleanNum}</Data></Cell>`;
                }
            }

            // Fechas en formato ISO YYYY-MM-DD
            if (col.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(valStr)) {
                const styleId = isZebra ? 'ZebraDate' : 'DateStyle';
                return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(valStr)}</Data></Cell>`;
            }

            return `<Cell ss:StyleID="${defaultStyle}"><Data ss:Type="String">${escapeXml(valStr)}</Data></Cell>`;
        }).join('\n    ');

        return `  <Row ss:Height="22">\n    ${cells}\n  </Row>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#334155"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <!-- Estilo Encabezado Corporativo RDL (Azul Marino con letras blancas) -->
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
  </Style>
  <!-- Texto Normal -->
  <Style ss:ID="NormalText">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="ZebraText">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <!-- Números -->
  <Style ss:ID="NumberStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <Style ss:ID="ZebraNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <!-- Moneda -->
  <Style ss:ID="CurrencyStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F766E" ss:Bold="1"/>
   <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <Style ss:ID="ZebraCurrency">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F766E" ss:Bold="1"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <!-- Porcentajes -->
  <Style ss:ID="PercentStyle">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#2563EB"/>
   <NumberFormat ss:Format="0.0%"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <Style ss:ID="ZebraPercent">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#2563EB"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <NumberFormat ss:Format="0.0%"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <!-- Fechas -->
  <Style ss:ID="DateStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <Style ss:ID="ZebraDate">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <!-- Estatus Corporativos para Incidencias y Metas -->
  <Style ss:ID="StatusAprobado">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#065F46" ss:Bold="1"/>
   <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/></Borders>
  </Style>
  <Style ss:ID="StatusPendiente">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#92400E" ss:Bold="1"/>
   <Interior ss:Color="#FFFBEB" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/></Borders>
  </Style>
  <Style ss:ID="StatusRechazado">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#991B1B" ss:Bold="1"/>
   <Interior ss:Color="#FEF2F2" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/></Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="${sName}">
  <Table ss:DefaultRowHeight="20">
   ${colDefs}
   <Row ss:Height="28">
    ${headerCells}
   </Row>
${dataRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

/**
 * Sanitiza valores contra Inyección de Fórmulas en CSV/Excel (CWE-1236)
 */
export function sanitizeFormula(val) {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    return str;
}

/**
 * Genera un archivo CSV con UTF-8 BOM para compatibilidad universal con Excel en Español
 */
export function generateCsv(columns, rows) {
    const BOM = '\uFEFF';
    const headerLine = columns.map(c => `"${sanitizeFormula(c.label).replace(/"/g, '""')}"`).join(';');
    const dataLines = rows.map(r => {
        return columns.map(c => {
            const fieldKey = c.id || c.key;
            const v = r[fieldKey];
            if (v === null || v === undefined) return '""';
            return `"${sanitizeFormula(v).replace(/"/g, '""')}"`;
        }).join(';');
    });

    return BOM + [headerLine, ...dataLines].join('\r\n');
}
