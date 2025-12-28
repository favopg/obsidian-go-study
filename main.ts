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

			// クリックされた要素自体、またはその親要素がリストアイテム(LI)に関連するかチェック
			const li = target.closest('li');
			if (li) {
				const text = li.textContent?.trim();
				// 「アタリ」という文字列が正確に含まれているか、またはリンクとしてクリックされている場合を考慮
				if (text === 'アタリ' || target.textContent?.trim() === 'アタリ') {
					
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
						new IgoStudyModal(this.app, this).open();
					}
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

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		this.renderProblemList();
	}

	async renderProblemList() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Igo Study - 問題集' });

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
			value: this.plugin.settings.problemTag
		});
		const searchBtn = searchContainer.createEl('button', { text: '検索' });

		const listContainer = contentEl.createDiv();

		const renderList = (filterTag: string) => {
			listContainer.empty();
			
			const allPages = Array.from(dv.pages(''));
			const lowerFilter = filterTag.toLowerCase();

			const pages = allPages.filter((p: any) => {
				// タグによるあいまい検索
				const tags = p.file.tags || [];
				const hasMatchingTag = tags.some((tag: string) => tag.toLowerCase().includes(lowerFilter));

				// igo_problem プロパティがある、またはタグがマッチする場合
				return p.igo_problem || hasMatchingTag;
			});

			if (pages.length === 0) {
				listContainer.createEl('p', { text: `問題が見つかりませんでした。キーワード "${filterTag}" を含むタグ、または "igo_problem" プロパティを確認してください。` });
				return;
			}

			const listEl = listContainer.createEl('ul');
			pages.forEach((page: any) => {
				const itemEl = listEl.createEl('li');
				const linkEl = itemEl.createEl('a', { text: page.file.name, cls: 'internal-link' });
				linkEl.onClickEvent(() => {
					this.showProblem(page);
				});
			});
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
		renderList(this.plugin.settings.problemTag);
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

				const problemEl = contentEl.createDiv();

				// コントロール類（入力欄、ボタン）を先に作成
				const controlsEl = problemEl.createDiv({ attr: { style: 'margin-bottom: 15px; display: flex; gap: 10px; align-items: center;' } });
				const answerInput = controlsEl.createEl('input', { type: 'text', placeholder: `正解の手順を入力 (デフォルト: ${this.plugin.settings.defaultAnswer})` });
				const checkBtn = controlsEl.createEl('button', { text: '答え合わせ' });
				const backBtn = controlsEl.createEl('button', { text: '戻る' });
				backBtn.onClickEvent(() => {
					this.renderProblemList();
				});

				const resultMsgEl = problemEl.createDiv({ cls: 'igo-result-message', attr: { style: 'font-weight: bold; margin-bottom: 10px; min-height: 1.5em;' } });
				resultMsgEl.setText(initialComment);
				const container = problemEl.createDiv({ cls: 'goboard-container' });
				
				// 総手数を取得
				const totalMoves = sgfAnswers.length;

				// 対応するSGFファイルを検索
				const sgfFile = this.app.vault.getFiles().find(f => f.name === `${page.file.name}.sgf` || f.path === page.sgf_path);

				if (sgfFile) {
					// SGFファイルが見つかった場合は埋め込みリンク形式を使用
					await MarkdownRenderer.renderMarkdown(`![[${sgfFile.path}|move=${totalMoves}]]`, container, page.file.path, this.plugin);
				} else {
					// SGFファイルが見つからない場合はフォールバックとしてコードブロックを使用
					// Componentを作成してライフサイクルを管理する
					// Go Board Viewerのコードブロックパラメータ形式に従い、sgfブロックを使用
					// Go Board Viewerはコードブロック内の <!-- move=N --> を解釈して初期手数をセットする
					await MarkdownRenderer.renderMarkdown(`\`\`\`sgf\n<!-- move=${totalMoves} -->\n${sgfData}\n\`\`\``, container, page.file.path, this.plugin);
				}

				// 碁盤のクリックイベントを設定（少し待ってからcanvasを探す）
				setTimeout(() => {
					const canvas = container.querySelector('canvas');
					if (canvas) {
						canvas.addEventListener('click', (evt: MouseEvent) => {
							const rect = canvas.getBoundingClientRect();
							const x = evt.clientX - rect.left;
							const y = evt.clientY - rect.top;
							
							const coords = this.convertClickToSgf(x, y, canvas.width, canvas.height, boardSize);
							const expectedAnswer = (page.answer || this.plugin.settings.defaultAnswer).toLowerCase().trim();
							
							// Frontmatterの正解、またはSGF内の着手と一致するか判定
							const isCorrect = coords === expectedAnswer || sgfAnswers.includes(coords);
							this.showFeedback(isCorrect, x, y, container);
							
							if (isCorrect) {
								resultMsgEl.setText('正解です！ (' + coords + ')');
								resultMsgEl.style.color = 'green';
							} else {
								resultMsgEl.setText('不正解です。 (' + coords + ')');
								resultMsgEl.style.color = 'red';
							}
						});
					}
				}, 500);

				checkBtn.onClickEvent(() => {
					const answer = answerInput.value.toLowerCase().trim();
					// Frontmatterのanswer、またはSGF内の着手と比較
					const expectedAnswer = (page.answer || this.plugin.settings.defaultAnswer).toLowerCase().trim();
					if (answer === expectedAnswer || sgfAnswers.includes(answer)) {
						resultMsgEl.setText('正解です！');
						resultMsgEl.style.color = 'green';
					} else {
						resultMsgEl.setText('不正解です。');
						resultMsgEl.style.color = 'red';
					}
				});
			} else {
				contentEl.createEl('p', { text: 'SGFデータが見つかりませんでした。' });
			}
		}
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
