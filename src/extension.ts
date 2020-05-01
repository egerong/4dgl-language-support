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
	context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: '4dgl'}, new DocumentSemanticTokensProvider(), legend));
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
		if (!tokenTypes.has(tokenType)) {
			return 0;
		}
		return tokenTypes.get(tokenType)!;
	}

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0;
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i];
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!);
			}
		}
		return result;
	}

	private _parseText(text: string): IParsedToken[] {
		let constants: string[] = [];
		let variables: string[] = [];
		let functions: string[] = [];

		let r: IParsedToken[] = [];
		let lines = text.split(/\r\n|\r|\n/);

		// Find functions and variables
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			
			//Add constants to list
			let constantDefine = line.match(/(#constant|word|byte) *\w*\b/);
			if (constantDefine != null) {
				constants.push(constantDefine[0].split(/ +/)[1]);

			}
			//Add functions to list
			let variableDefine = line.match(/\bvar *\w*\b/);
			if (variableDefine != null) {
				variables.push(variableDefine[0].split(/ +/)[1]);

			}
			//Add functions to list
			let functionDefine = line.match(/\bfunc *\w*\b/);
			if (functionDefine != null) {
				functions.push(functionDefine[0].split(/ +/)[1]);

			}

		}

		// Assing tokens
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let words = line.split(/\b/);
			let currentIndex = 0;
			for (let j=0; j < words.length; j++) {
				
				let wordType = null;
				const word = words[j];
				const wordLen = word.length;
				//console.log(word);
				if (functions.includes(word)) {
					wordType = 'function';
				}
				if (constants.includes(word)) {
					wordType = 'property';
				}
				if (variables.includes(word)) {
					wordType = 'variable';
				}
				if (wordType != null) {
					//console.log("Match line", i+1, ":", word, wordLen);
					r.push({
						line: i,
						startCharacter: currentIndex,
						length: wordLen,
						tokenType: wordType,
						tokenModifiers: []
					});
				}
				currentIndex += wordLen;
			}

			let currentOffset = 0;
			while (false) {
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
			} while (false);
		}
		return r;
	}

	private _parseTextToken(text: string): { tokenType: string; tokenModifiers: string[]; } {
		let parts = text.split(' ');
		return {
			tokenType: parts[0],
			tokenModifiers: parts.slice(1)
		};
	}
}
