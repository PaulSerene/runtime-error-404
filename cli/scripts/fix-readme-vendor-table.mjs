import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COLGROUP = `<colgroup>
<col span="6" style="width:16.67%" />
</colgroup>
`;

const GROK_CELL_RE =
  /\s*<td align="center"(?: width="(?:16|20)%")?>\s*<a href="https:\/\/grok\.x\.ai">[\s\S]*?<\/td>/;
const KIRO_CELL_RE =
  /\s*<td align="center"(?: width="(?:16|20)%")?>\s*<a href="https:\/\/kiro\.dev">[\s\S]*?<\/td>/;
const EMPTY_CELL_RE = /\s*<td align="center"(?: width="(?:16|20)%")?><\/td>/g;

function fixVendorTable(content) {
  const tableStart = content.indexOf("<table>\n");
  if (tableStart === -1) return content;

  const tableEnd = content.indexOf("</table>", tableStart);
  if (tableEnd === -1) return content;

  let table = content.slice(tableStart, tableEnd + "</table>".length);

  table = table.replace(/<colgroup>[\s\S]*?<\/colgroup>\n?/, "");
  table = table.replace("<table>\n", `<table>\n${COLGROUP}`);
  table = table.replace(
    /<td align="center" width="(?:16|20)%">/g,
    '<td align="center">',
  );
  table = table.replace(EMPTY_CELL_RE, "");

  const grokMatch = table.match(GROK_CELL_RE);
  const kiroMatch = table.match(KIRO_CELL_RE);
  if (!grokMatch || !kiroMatch) {
    return (
      content.slice(0, tableStart) +
      table +
      content.slice(tableEnd + "</table>".length)
    );
  }

  const grokCell = grokMatch[0];
  const kiroCell = kiroMatch[0];

  table = table.replace(GROK_CELL_RE, "");
  table = table.replace(KIRO_CELL_RE, "");

  const firstRowEnd = table.indexOf("</tr>\n<tr>");
  if (firstRowEnd === -1) {
    return (
      content.slice(0, tableStart) +
      table +
      content.slice(tableEnd + "</table>".length)
    );
  }

  const firstRow = table.slice(0, firstRowEnd);
  const rest = table.slice(firstRowEnd);

  const updatedFirstRow = `${firstRow}${grokCell}\n`;
  const updatedRest = rest.replace(
    "</tr>\n</table>",
    `${kiroCell}\n</tr>\n</table>`,
  );

  table = updatedFirstRow + updatedRest;

  table = table.replace(/\n\n<td align="center">/g, '\n<td align="center">');

  return (
    content.slice(0, tableStart) +
    table +
    content.slice(tableEnd + "</table>".length)
  );
}

const root = fixVendorTable(readFileSync("README.md", "utf8"));
writeFileSync("README.md", root);
console.log("updated README.md");

for (const file of readdirSync("docs")) {
  if (!/^README\..+\.md$/.test(file)) continue;
  const path = join("docs", file);
  const next = fixVendorTable(readFileSync(path, "utf8"));
  writeFileSync(path, next);
  console.log("updated", path);
}
