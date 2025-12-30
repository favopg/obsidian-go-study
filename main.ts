import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownRenderer } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	problemTag: string;
	defaultAnswer: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	problemTag: 'igo-problem',
	defaultAnswer: 'pd'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'igo-study-command',
			name: 'Igo Study',
			callback: async () => {
				const file = this.app.vault.getAbstractFileByPath('メニュー.md');
				if (file) {
					const leaf = this.app.workspace.getLeaf(false);
					await leaf.openFile(file as any);
				} else {
					new Notice('メニュー.md が見つかりません。');
					new IgoStudyModal(this.app, this).open();
				}
			}
		});

		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, _view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;

			// モーダル内のクリックは無視する
			if (target.closest('.modal')) return;

			// リンク(aタグ)のクリックは無視する
			if (target.closest('a')) return;

			// クリックされた要素自体、またはその親要素がリストアイテム(LI)に関連するかチェック
			const li = target.closest('li');
			if (li) {
				const text = li.textContent?.trim() || target.textContent?.trim() || "";
				if (!text) return;

				let isExercise = false;
				
				// 1. 直前の要素を遡って見出しを探す（ライブプレビューやプレビューモードの一般的な構造）
				let container = li.closest('ul, ol');
				if (container) {
					let prev = container.previousElementSibling;
					while (prev) {
						if (prev.tagName.match(/^H[1-6]$/)) {
							if (prev.textContent?.includes('練習問題')) {
								isExercise = true;
							}
							break; // 見出しが見つかったら、それが「練習問題」でなくてもループを抜ける（直近の見出しが対象）
						}
						prev = prev.previousElementSibling;
					}
				}
				
				// 2. もし見つからなかった場合、もっと広範囲に探す（コンテナ内の前の見出し）
				if (!isExercise) {
					// 現在の表示領域（MarkdownView）内のみに限定して探すのが理想的
					const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (activeView) {
						const contentEl = activeView.contentEl;
						const allHeadings = Array.from(contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));
						let lastHeadingBeforeLi = null;
						for (const h of allHeadings) {
							if (h.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) {
								lastHeadingBeforeLi = h;
							} else {
								break;
							}
						}
						if (lastHeadingBeforeLi && lastHeadingBeforeLi.textContent?.includes('練習問題')) {
							isExercise = true;
						}
					}
				}

				if (isExercise) {
					new IgoStudyModal(this.app, this, text).open();
				}
			}
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class IgoStudyModal extends Modal {
	plugin: MyPlugin;
	initialTag: string;

	constructor(app: App, plugin: MyPlugin, initialTag: string = "") {
		super(app);
		this.plugin = plugin;
		this.initialTag = initialTag;
	}

	async onOpen() {
		this.renderProblemList();
	}

	async renderProblemList() {
		const { contentEl } = this;
		contentEl.empty();
		const title = this.initialTag ? `${this.initialTag}問題集` : 'Igo Study - 問題集';
		contentEl.createEl('h2', { text: title });

		const dv = (this.app as any).plugins.plugins.dataview?.api;
		if (!dv) {
			contentEl.createEl('p', { text: 'Dataviewプラグインが有効ではありません。' });
			return;
		}

		// 検索用UI
		const searchContainer = contentEl.createDiv({ attr: { style: 'margin-bottom: 20px; display: flex; gap: 10px; align-items: center;' } });
		searchContainer.createSpan({ text: 'タグで絞り込み:' });
		const tagInput = searchContainer.createEl('input', { 
			type: 'text', 
			placeholder: 'タグを入力 (例: tsumego)',
			value: this.initialTag || this.plugin.settings.problemTag
		});
		const searchBtn = searchContainer.createEl('button', { text: '検索' });

		const progressEl = contentEl.createDiv({ attr: { style: 'margin-bottom: 15px; font-weight: bold;' } });

		const listContainer = contentEl.createDiv();

		const updateProgress = () => {
			const checkboxes = listContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
			const total = checkboxes.length;
			const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
			const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
			progressEl.setText(`練習問題の達成度：${percentage}%`);
		};

		const renderList = (filterTag: string) => {
			listContainer.empty();
			
			const allPages = Array.from(dv.pages(''));
			const lowerFilter = filterTag.toLowerCase();

			const pages = allPages.filter((p: any) => {
				// tags プロパティによるあいまい検索
				let tags = p.tags || [];
				if (!Array.isArray(tags)) {
					tags = [tags];
				}
				const hasMatchingTag = tags.some((tag: any) => 
					typeof tag === 'string' && tag.toLowerCase().includes(lowerFilter)
				);

				// igo_problem プロパティがある、またはタグがマッチする場合
				// filterTagが空の場合は全件表示（またはigo_problemのみ）を考慮
				if (!filterTag) {
					return p.igo_problem;
				}

				return p.igo_problem || hasMatchingTag;
			});

			if (pages.length === 0) {
				listContainer.createEl('p', { text: `問題が見つかりませんでした。キーワード "${filterTag}" を含むタグ、または "igo_problem" プロパティを確認してください。` });
				updateProgress();
				return;
			}

			const listEl = listContainer.createEl('ul', { attr: { style: 'list-style: none; padding-left: 0;' } });
			pages.forEach((page: any) => {
				const itemEl = listEl.createEl('li', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--background-modifier-border-focus);' } });
				
				const checkbox = itemEl.createEl('input', { type: 'checkbox', attr: { style: 'width: 20px; height: 20px; cursor: pointer;' } });
				// Dataviewのプロパティ(completedなど)があれば初期値にする
				if (page.completed === true) {
					checkbox.checked = true;
				}

				checkbox.addEventListener('change', () => {
					updateProgress();
					// 必要に応じて永続化処理を追加可能
				});

				const linkEl = itemEl.createEl('a', { text: page.file.name, cls: 'internal-link', attr: { style: 'font-size: 1.1em; flex-grow: 1; padding: 5px 0;' } });
				linkEl.onClickEvent(() => {
					this.showProblem(page);
				});
			});

			updateProgress();
		};

		searchBtn.onClickEvent(() => {
			renderList(tagInput.value.trim());
		});

		tagInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				renderList(tagInput.value.trim());
			}
		});

		// 初回描画
		renderList(tagInput.value.trim());
	}

	async showProblem(page: any) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: `問題: ${page.file.name}` });

		// ファイル内容を読み込んでSGFブロックを探す
		const file = this.app.vault.getAbstractFileByPath(page.file.path);
		if (file) {
			const tfile = file as any;
			const content = await this.app.vault.read(tfile);
			
			const sgfMatch = content.match(/```sgf-?edit?([\s\S]*?)```/);
			if (sgfMatch) {
				const sgfData = sgfMatch[1].trim();
				const boardSizeMatch = sgfData.match(/SZ\[(\d+)\]/);
				const boardSize = boardSizeMatch ? parseInt(boardSizeMatch[1]) : 19;

				// SGFから正解候補を抽出 (例: ;B[pd] の pd 部分)
				const sgfAnswers: string[] = [];
				const moveMatches = sgfData.matchAll(/[BW]\[([a-z]{2})\]/g);
				for (const moveMatch of moveMatches) {
					sgfAnswers.push(moveMatch[1].toLowerCase());
				}
				
				// SGFからコメント(C[])を抽出
				const commentMatch = sgfData.match(/C\[([\s\S]*?)\]/);
				const initialComment = commentMatch ? commentMatch[1] : "";

				// SGFからポイント(RE[])を抽出
				const reMatch = sgfData.match(/RE\[([\s\S]*?)\]/);
				const resultValue = reMatch ? reMatch[1] : "";

				const problemEl = contentEl.createDiv();

				// コントロール類（プルダウン、ボタン）を先に作成
				const controlsEl = problemEl.createDiv({ attr: { style: 'margin-bottom: 15px; display: flex; gap: 10px; align-items: center;' } });
				
				const answerSelect = controlsEl.createEl('select');
				answerSelect.createEl('option', { text: '回答を選択してください', value: '' });
				if (page.question) {
					const options = String(page.question).split(',').map(s => s.trim());
					options.forEach(opt => {
						answerSelect.createEl('option', { text: opt, value: opt });
					});
				}

				const checkBtn = controlsEl.createEl('button', { text: '答え合わせ' });
				const backBtn = controlsEl.createEl('button', { text: '戻る' });
				backBtn.onClickEvent(() => {
					this.renderProblemList();
				});

				const resultMsgEl = problemEl.createDiv({ cls: 'igo-result-message', attr: { style: 'font-weight: bold; margin-bottom: 10px; min-height: 1.5em; white-space: pre-wrap;' } });
				resultMsgEl.setText(initialComment);
				const container = problemEl.createDiv({ cls: 'goboard-container' });
				
				// 再描画用の関数を定義
				const refreshBoard = async (newSgf: string, moveCount: number) => {
					container.empty();
					const sgfFile = this.app.vault.getFiles().find(f => f.name === `${page.file.name}.sgf` || f.path === page.sgf_path);
					if (sgfFile && newSgf === sgfData) {
						await MarkdownRenderer.renderMarkdown(`![[${sgfFile.path}|move=${moveCount}]]`, container, page.file.path, this.plugin);
					} else {
						await MarkdownRenderer.renderMarkdown(`\`\`\`sgf\n<!-- move=${moveCount} -->\n${newSgf}\n\`\`\``, container, page.file.path, this.plugin);
					}
					
					// 再描画後にクリックイベントを再設定
					setTimeout(() => {
						const canvas = container.querySelector('canvas');
						if (canvas) {
							canvas.style.cursor = 'pointer';
							canvas.addEventListener('click', handleBoardClick);
						}
					}, 500);
				};

				const handleBoardClick = (evt: MouseEvent) => {
					const canvas = evt.target as HTMLCanvasElement;
					const rect = canvas.getBoundingClientRect();
					const x = evt.clientX - rect.left;
					const y = evt.clientY - rect.top;
					
					const coords = this.convertClickToSgf(x, y, canvas.width, canvas.height, boardSize);
					processAnswer(coords, x, y);
				};

				const processAnswer = async (coords: string, x?: number, y?: number) => {
					// Frontmatterの正解(カンマ区切り対応)、またはSGF内の着手と一致するか判定
					const expectedAnswers = String(page.answer || this.plugin.settings.defaultAnswer)
						.split(',')
						.map(s => s.toLowerCase().trim());
					
					// 人間座標(C7等)をSGF形式(cc等)に変換して比較
					const normalizedExpected = expectedAnswers.map(ans => {
						if (ans.match(/^[a-z][0-9]{1,2}$/i)) {
							return this.humanToSgf(ans, boardSize);
						}
						return ans;
					});

					const isCorrect = normalizedExpected.includes(coords) || sgfAnswers.includes(coords);
					
					if (x !== undefined && y !== undefined) {
						this.showFeedback(isCorrect, x, y, container);
					}

					// 石を置いた状態のSGFを作成
					// 手番を判定（SGFの最後の手がBなら次はW、そうでなければB。問題は通常白番か黒番か固定だが、ここでは最後の手の逆とする）
					const lastMoveMatch = sgfData.match(/;([BW])\[([a-z]{2})\](?=[^;]*\s*\)$)/);
					const nextColor = (lastMoveMatch && lastMoveMatch[1] === 'B') ? 'W' : 'B';
					
					// SGFの最後の閉じ括弧の前に新しい手を追加する（空白や改行を考慮）
					const updatedSgf = sgfData.replace(/(\)\s*)$/, `;${nextColor}[${coords}]$1`);
					
					await refreshBoard(updatedSgf, sgfAnswers.length + 1);

					if (isCorrect) {
						resultMsgEl.setText('正解です！ (' + this.sgfToHuman(coords, boardSize) + ')');
						resultMsgEl.style.color = 'green';
					} else {
						resultMsgEl.setText('不正解です。 (' + this.sgfToHuman(coords, boardSize) + ')' + (resultValue ? '\nポイント: ' + resultValue : ''));
						resultMsgEl.style.color = 'red';
					}
				};

				// 初回描画
				await refreshBoard(sgfData, sgfAnswers.length);

				checkBtn.onClickEvent(() => {
					const answer = answerSelect.value.toLowerCase().trim();
					if (!answer) {
						new Notice('回答を選択してください');
						return;
					}
					
					let coords = answer;
					if (answer.match(/^[a-z][0-9]{1,2}$/i)) {
						coords = this.humanToSgf(answer, boardSize);
					}
					processAnswer(coords);
				});
			} else {
				contentEl.createEl('p', { text: 'SGFデータが見つかりませんでした。' });
			}
		}
	}

	humanToSgf(human: string, boardSize: number): string {
		const colChar = human.charAt(0).toLowerCase();
		let col = colChar.charCodeAt(0) - 97; // 'a' = 0
		if (colChar > 'i') col--; // 囲碁の座標では 'i' を飛ばすのが一般的だが、SGFでは飛ばさない。
		// ただし、入力が 'C7' のような形式の場合、'i' を飛ばしている可能性が高い。
		// Go Board Viewerの座標系を確認する必要があるが、一旦単純な変換を試みる。
		
		// 再考：Go Board Viewerが'C7'と表示している場合、'I'を除いた座標系(A-T, no I)
		const alpha = "abcdefghjklmnopqrstuvwxyz";
		const xIndex = alpha.indexOf(colChar);
		
		const row = boardSize - parseInt(human.substring(1));
		
		const charX = String.fromCharCode(97 + xIndex);
		const charY = String.fromCharCode(97 + row);
		return charX + charY;
	}

	sgfToHuman(sgf: string, boardSize: number): string {
		const x = sgf.charCodeAt(0) - 97;
		const y = sgf.charCodeAt(1) - 97;
		
		const alpha = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
		const col = alpha.charAt(x);
		const row = boardSize - y;
		return col + row;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	convertClickToSgf(x: number, y: number, width: number, height: number, boardSize: number): string {
		// Go Board Viewerの描画ロジックに合わせる必要があります
		// 一般的な実装では、端に半グリッド分のマージンがあることが多いです
		const stepX = width / boardSize;
		const stepY = height / boardSize;
		
		const col = Math.floor(x / stepX);
		const row = Math.floor(y / stepY);
		
		const charX = String.fromCharCode(97 + col); // 'a' = 97
		const charY = String.fromCharCode(97 + row);
		
		return charX + charY;
	}

	showFeedback(isCorrect: boolean, x: number, y: number, container: HTMLElement) {
		const mark = document.createElement('div');
		mark.addClass(isCorrect ? 'igo-correct-mark' : 'igo-wrong-mark');
		mark.style.left = `${x}px`;
		mark.style.top = `${y}px`;
		
		container.appendChild(mark);
		
		setTimeout(() => {
			mark.remove();
		}, 1000);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Igo Study 設定'});

		new Setting(containerEl)
			.setName('問題検索用タグ')
			.setDesc('問題ファイルとして認識するためのタグを指定します。')
			.addText(text => text
				.setPlaceholder('igo-problem')
				.setValue(this.plugin.settings.problemTag)
				.onChange(async (value) => {
					this.plugin.settings.problemTag = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('デフォルトの正解')
			.setDesc('問題ファイルに正解が指定されていない場合のデフォルト回答です。')
			.addText(text => text
				.setPlaceholder('pd')
				.setValue(this.plugin.settings.defaultAnswer)
				.onChange(async (value) => {
					this.plugin.settings.defaultAnswer = value;
					await this.plugin.saveSettings();
				}));
	}
}
