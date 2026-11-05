import ts from "typescript";

/**
 * Parse TypeScript/JavaScript with the TypeScript compiler and collect only
 * syntactically declared, statically-resolvable module references. Comments,
 * strings, and regular expressions are intentionally ignored by the AST.
 */
export function analyzeModuleReferences(source, fileName = "fixture.ts") {
  const scriptKind = /\.tsx$/i.test(fileName)
    ? ts.ScriptKind.TSX
    : /\.jsx$/i.test(fileName)
      ? ts.ScriptKind.JSX
      : /\.js$/i.test(fileName) || /\.mjs$/i.test(fileName) || /\.cjs$/i.test(fileName)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const references = [];
  const diagnostics = (sourceFile.parseDiagnostics ?? []).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    line: diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1,
  }));

  const add = (node, kind) => {
    if (ts.isStringLiteralLike(node)) {
      references.push({ specifier: node.text, kind, line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 });
    }
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node.moduleSpecifier, ts.isImportDeclaration(node) ? "import" : "export");
    } else if (ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      add(node.moduleReference.expression, "import-equals");
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) {
        add(node.arguments[0], "dynamic-import");
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1) {
        add(node.arguments[0], "require");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { references, diagnostics };
}

/**
 * Find browser persistence primitives in production TypeScript. These APIs
 * belong only in the designated browser persistence adapter; callers must use
 * the application repository boundary instead.
 */
export function analyzeBrowserPersistenceReferences(source, fileName = "fixture.ts") {
  const scriptKind = /\\.tsx$/i.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const references = [];
  const guardedNames = new Set(["browserDatabase", "indexedDB", "IDBDatabase", "IDBObjectStore", "IDBTransaction"]);
  const visit = (node) => {
    if (ts.isIdentifier(node) && guardedNames.has(node.text)) {
      references.push({
        symbol: node.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Dexie") {
      references.push({
        symbol: "new Dexie",
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}
