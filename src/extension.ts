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

export function activate(context: vscode.ExtensionContext) {
	//context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: '4dgl'}, new DocumentSemanticTokensProvider(), legend));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({language: '4dgl'}, new DocumentSymbolProvider, undefined));
}

class DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
		let allSymbols: vscode.DocumentSymbol[] = [];
		//allSymbols.push(new vscode.DocumentSymbol('asi', 'details', vscode.SymbolKind.Function, new vscode.Range(0,0,2,2), new vscode.Range(1,1,1,5)));
		allSymbols = this._parseText(document)
		return allSymbols
	}

	private _parseText(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		let symbols: vscode.DocumentSymbol[] = [];
		
		for (let i = 0; i < document.lineCount; ++i) {
			const line = document.lineAt(i);
				let somethingNew = false;
			
				if (line.isEmptyOrWhitespace) {
					continue
				}
				
				//Add constants to list
				let constantDefine = line.text.match(/(#constant|word|byte) *\w*\b/);
				if (constantDefine != null) {
					somethingNew = true;
					const name = (constantDefine[0].split(/ +/)[1]);
					const start = line.text.indexOf(name);
					const end = start + name.length;
					const start2 = start;
					const end2 = end;
					symbols.push(new vscode.DocumentSymbol(
						name,
						'',
						vscode.SymbolKind.Constant,
						new vscode.Range(i, start, i, end),
						new vscode.Range(i, start2, i, end2),
					))
				}
		}
		return symbols
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