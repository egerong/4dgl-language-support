import * as vscode from 'vscode';

const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

const legend = (function () {
	const tokenTypesLegend = [
		'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
		'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
		'member', 'macro', 'variable', 'parameter', 'property', 'label'
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

	const tokenModifiersLegend = [
		'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
		'modification', 'async'
	];
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));

	return new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();

let documentSymbols = new Map<vscode.Uri, vscode.DocumentSymbol[]>();
let completionItems: vscode.CompletionItem[] = [];
let workspaceSymbols: vscode.SymbolInformation[] = [];

export function activate(context: vscode.ExtensionContext) {
	//context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: '4dgl'}, new DocumentSemanticTokensProvider(), legend));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({language: '4dgl'}, new DocumentSymbolProvider, undefined));
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider({language: '4dgl'}, new CompletionItemProvider))
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument))
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument))
	for (let document of vscode.workspace.textDocuments) {
		parseDocument(document);
	}
}

function onDidOpenTextDocument(document: vscode.TextDocument): void {
	parseDocument(document);
}

function onDidChangeTextDocument(change: vscode.TextDocumentChangeEvent): void {

	parseDocument(change.document);
}

function parseDocument(document: vscode.TextDocument): void {

	const regexMap = new Map<string, RegExp>( [
		['variable', /\bvar +\*?(\w+)\b/g],
		['constant', /(#constant|word|byte) *\w* *\b/g],
		['funcStart', /\bfunc +(\w+) ?\(/],
		['funcEnd', /\bendfunc\b/g ]
	])
		
	
	//console.debug("PARSE");
	let symbols: vscode.DocumentSymbol[] = [];
	let completions: vscode.CompletionItem[] = [];
	let scope = global;
	let currentFunction = null;
	for (let i = 0; i < document.lineCount; ++i) {
		
		const line = document.lineAt(i);
		if (line.isEmptyOrWhitespace) {
			continue
		}
		let regex;
		const lineText = line.text;
		
		//Add functions
		regex = regexMap.get('funcStart');
		if (regex) {
			const match = lineText.match(regex);
			if (match) {
				const name = match[1];	
				const start = lineText.indexOf(name);
				const end = start + name.length;
				completions.push(
					new vscode.CompletionItem(
						name,
						vscode.CompletionItemKind.Function
					)
				);
				currentFunction = new vscode.DocumentSymbol(
					match[1],
					'',
					vscode.SymbolKind.Function,
					line.range,
					new vscode.Range(i, start, i, end),
				);
			}
		}
		regex = regexMap.get('funcEnd');
		if (regex) {
			const match = lineText.match(regex);
			if (match && currentFunction) {
				currentFunction.range = currentFunction.range.with({end: line.range.end})
				symbols.push(currentFunction);
				currentFunction = null;
			}
		}


		//Add variables
		regex = regexMap.get('variable');
		if (regex) {
			const matches = lineText.matchAll(regex);
			for (const match of matches) {
				const name = match[1];
				const start = lineText.indexOf(name);
				const end = start + name.length;
				const variable = new vscode.DocumentSymbol(
					name,
					'',
					vscode.SymbolKind.Variable,
					new vscode.Range(i, start, i, end),
					new vscode.Range(i, start, i, end),
				)
				if (currentFunction) {
					currentFunction.children.push(variable);
				} else {
					symbols.push(variable);
				}
			}
		}
		/*
		
			let match = lineText.match(regex);
			while (match) {
				console.log(match);
				
				
				
				lineText.match(regex)
			}
		}
		*/
		
		
		//Add constants to list
		let constantDefine = line.text.match(/(#constant|word|byte) *\w* *\b/);
		if (constantDefine != null) {
			const name = constantDefine[0].split(/ +/)[1];
			const details = constantDefine[0].split(/ +/)[2]
			const start = line.text.indexOf(name);
			const end = start + name.length;
			const start2 = start;
			const end2 = end;
			symbols.push(
				new vscode.DocumentSymbol(
					name,
					details,
					vscode.SymbolKind.Constant,
					new vscode.Range(i, start, i, end),
					new vscode.Range(i, start2, i, end2),
				)
			);
		}
	}
	documentSymbols.set(document.uri, symbols);
	completionItems = completions;
}



class DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
		const symbols = documentSymbols.get(document.uri);
		if (symbols == undefined) {
			return []
		}
		return symbols
	}
}

class CompletionItemProvider implements vscode.CompletionItemProvider {
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext):
	Promise<vscode.CompletionItem[] | vscode.CompletionList> {
		return completionItems;
	}
}

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const allTokens = this._parseText(document.getText());
		const builder = new vscode.SemanticTokensBuilder();
		allTokens.forEach((token) => {
			builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
		});
		return builder.build();
	}

	private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!;
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2;
		}
		return 0;
	}

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0;
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i];
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!);
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2);
			}
		}
		return result;
	}

	private _parseText(text: string): IParsedToken[] {
		let r: IParsedToken[] = [];
		let lines = text.split(/\r\n|\r|\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let currentOffset = 0;
			do {
				const openOffset = line.indexOf('[', currentOffset);
				if (openOffset === -1) {
					break;
				}
				const closeOffset = line.indexOf(']', openOffset);
				if (closeOffset === -1) {
					break;
				}
				let tokenData = this._parseTextToken(line.substring(openOffset + 1, closeOffset));
				r.push({
					line: i,
					startCharacter: openOffset + 1,
					length: closeOffset - openOffset - 1,
					tokenType: tokenData.tokenType,
					tokenModifiers: tokenData.tokenModifiers
				});
				currentOffset = closeOffset;
			} while (true);
		}
		return r;
	}

	private _parseTextToken(text: string): { tokenType: string; tokenModifiers: string[]; } {
		let parts = text.split('.');
		return {
			tokenType: parts[0],
			tokenModifiers: parts.slice(1)
		};
	}
}