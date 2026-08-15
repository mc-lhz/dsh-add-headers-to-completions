window.__ModuleLoader__.load({
	id: "dsh-llm-headers",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/styles.ts
		/**
		* dsh-llm-headers — 区块样式（TS 内嵌，替代 CSS Modules）。
		* 说明：vendored 构建链路（tsdown 0.22 + rolldown 1.2.4）对 .css 走内置
		* asset 管线，插件 resolveId 无法抢在 css-guard 前重映射虚拟 id；这里改为
		* 纯 TS 模块导出 css 文本 + 类名表，并在模块作用域（即 bundle factory 执行
		* 时）自注入 <style data-plugin="dsh-llm-headers"> 标签，loader 卸载插件时
		* 会随 data-plugin 移除；无需任何构建期 CSS 处理。
		*/
		const classes = {
			section: "dsh-hdr-section",
			desc: "dsh-hdr-desc",
			block: "dsh-hdr-block",
			blockTitle: "dsh-hdr-block-title",
			kvBlock: "dsh-hdr-kvs",
			kvRow: "dsh-hdr-kv-row",
			kvName: "dsh-hdr-kv-name",
			kvValue: "dsh-hdr-kv-value",
			groupKey: "dsh-hdr-group-key",
			kvRemove: "dsh-hdr-remove",
			add: "dsh-hdr-add",
			groupList: "dsh-hdr-group-list",
			group: "dsh-hdr-group",
			groupHead: "dsh-hdr-group-head",
			hint: "dsh-hdr-hint"
		};
		const css = `
.dsh-hdr-section { display: flex; flex-direction: column; gap: 18px; padding: 4px 0; }
.dsh-hdr-desc { opacity: .72; font-size: 13px; line-height: 1.6; margin: 0 0 4px; }
.dsh-hdr-block { display: flex; flex-direction: column; gap: 8px; }
.dsh-hdr-block-title { font-size: 14px; font-weight: 600; margin: 0; }
.dsh-hdr-kvs { display: flex; flex-direction: column; gap: 6px; }
.dsh-hdr-kv-row { display: flex; gap: 8px; align-items: center; }
.dsh-hdr-kv-name, .dsh-hdr-kv-value, .dsh-hdr-group-key {
  padding: 5px 8px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border, rgba(128,128,128,.35));
  background: var(--dsw-alias-surface-muted, rgba(128,128,128,.08));
  color: var(--dsw-alias-foreground, inherit); font-size: 13px;
}
.dsh-hdr-kv-name { flex: 0 0 220px; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-kv-value { flex: 1; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-group-key { flex: 1; font-family: var(--dsw-alias-font-mono, ui-monospace, monospace); }
.dsh-hdr-remove { border: none; background: transparent; color: var(--dsw-alias-foreground-muted, rgba(128,128,128,.8)); cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 6px; }
.dsh-hdr-remove:hover { color: var(--dsw-alias-danger, #e5484d); background: var(--dsw-alias-danger-muted, rgba(229,72,77,.12)); }
.dsh-hdr-add { align-self: flex-start; padding: 4px 10px; border-radius: 6px; border: 1px dashed var(--dsw-alias-border-strong, rgba(128,128,128,.5)); background: transparent; color: var(--dsw-alias-foreground-muted, rgba(128,128,128,.9)); cursor: pointer; font-size: 13px; }
.dsh-hdr-add:hover { border-style: solid; }
.dsh-hdr-group-list { display: flex; flex-direction: column; gap: 10px; }
.dsh-hdr-group { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, rgba(128,128,128,.25)); background: var(--dsw-alias-surface, rgba(128,128,128,.04)); }
.dsh-hdr-group-head { display: flex; gap: 8px; align-items: center; }
.dsh-hdr-hint { opacity: .6; font-size: 13px; padding: 8px 0; }
`;
		const TAG_ID = "dsh-llm-headers/styles";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-headers";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/HeadersSection.tsx
		/**
		* dsh-llm-headers — 设置页"请求头"区块（软替换，与官方 Models 页共存）。
		* 三层编辑器：global / providers / models，任何改动即时经 settings.mutate
		* 落盘（带 expectedRevision），host 半边收到 document-updated 后重载注入表。
		* 样式走 CSS Modules（构建期 lightningcss 编译，<style data-plugin> 注入）。
		*/
		let uid = 0;
		const newId = () => `r${++uid}`;
		const toRows = (map) => Object.entries(map ?? {}).map(([name, value]) => ({
			id: newId(),
			name,
			value
		}));
		const toGroups = (map) => Object.entries(map ?? {}).map(([key, kv]) => ({
			id: newId(),
			key,
			rows: toRows(kv)
		}));
		/**
		* KV 行：本地编辑，实时提交到 [basePath..., name]。
		* oldName 存在且已改名时，先按旧名 unset 再按新名 set。
		*/
		function RowInput(props) {
			const { t, row, commit, remove } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes.kvRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: classes.kvName,
						value: row.name,
						placeholder: t.headerName,
						onChange: (e) => commit({
							...row,
							name: e.target.value
						}, row.name === "" ? void 0 : row.name)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: classes.kvValue,
						value: row.value,
						placeholder: t.headerValue,
						onChange: (e) => commit({
							...row,
							value: e.target.value
						}, void 0)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: classes.kvRemove,
						onClick: () => remove(row),
						title: t.remove,
						children: "✕"
					})
				]
			});
		}
		/** 扁平 KV 编辑器（global / 某个提供方或模型的内部表）。 */
		function KvEditor(props) {
			const { t, rows, setRows, basePath, onChange, addLabel } = props;
			const commit = (row, oldName) => {
				if (row.name.length > 0 && row.value.length > 0) onChange([...basePath, row.name], row.value, false);
				else if (row.name.length > 0) onChange([...basePath, row.name], "", true);
				if (oldName !== void 0 && oldName !== row.name && oldName.length > 0) onChange([...basePath, oldName], "", true);
			};
			const remove = (row) => {
				if (row.name.length > 0) onChange([...basePath, row.name], "", true);
				setRows(rows.filter((r) => r.id !== row.id));
			};
			const add = () => {
				const next = [...rows, {
					id: newId(),
					name: "",
					value: ""
				}];
				setRows(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes.kvBlock,
				children: [rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowInput, {
					t,
					row,
					commit,
					remove
				}, row.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: classes.add,
					onClick: add,
					children: ["+ ", addLabel]
				})]
			});
		}
		/** 分组编辑器（providers / models）：键可改名，子项为 KV 行。 */
		function GroupEditor(props) {
			const { t, groups, setGroups, basePath, onChange, keyPlaceholder, addLabel } = props;
			const commitKey = (group, oldKey, nextKey) => {
				if (nextKey.length === 0 || nextKey === oldKey) return;
				for (const row of group.rows) {
					if (row.name.length === 0) continue;
					onChange([
						...basePath,
						nextKey,
						row.name
					], row.value, false);
					onChange([
						...basePath,
						oldKey,
						row.name
					], "", true);
				}
			};
			const removeGroup = (group) => {
				for (const row of group.rows) if (row.name.length > 0) onChange([
					...basePath,
					group.key,
					row.name
				], "", true);
				setGroups(groups.filter((g) => g.id !== group.id));
			};
			const addGroup = () => {
				setGroups([...groups, {
					id: newId(),
					key: "",
					rows: [{
						id: newId(),
						name: "",
						value: ""
					}]
				}]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes.groupList,
				children: [groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: classes.group,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: classes.groupHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: classes.groupKey,
							value: group.key,
							placeholder: keyPlaceholder,
							onChange: (e) => {
								const nextKey = e.target.value;
								commitKey(group, group.key, nextKey);
								setGroups(groups.map((g) => g.id === group.id ? {
									...g,
									key: nextKey
								} : g));
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: classes.kvRemove,
							onClick: () => removeGroup(group),
							title: t.remove,
							children: "✕"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KvEditor, {
						t,
						rows: group.rows,
						setRows: (rows) => setGroups(groups.map((g) => g.id === group.id ? {
							...g,
							rows
						} : g)),
						basePath: [...basePath, group.key],
						onChange,
						addLabel: t.headerName
					})]
				}, group.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: classes.add,
					onClick: addGroup,
					children: ["+ ", addLabel]
				})]
			});
		}
		function HeadersSection(props) {
			const { scope, useSnapshot, t } = props;
			const snap = useSnapshot((s) => s);
			const writable = snap.writable;
			const value = snap.value;
			const touched = (0, react.useRef)(false);
			const [globalRows, setGlobalRows] = (0, react.useState)(() => {
				if (value !== void 0 && !touched.current) touched.current = true;
				return toRows(value?.global);
			});
			const [providerGroups, setProviderGroups] = (0, react.useState)(() => toGroups(value?.providers));
			const [modelGroups, setModelGroups] = (0, react.useState)(() => toGroups(value?.models));
			const onChange = (path, value, remove) => {
				if (!writable) return;
				if (remove) scope.unsetPath(...path);
				else scope.setPath(path, value);
			};
			if (snap.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes.hint,
				children: t.loading
			});
			if (snap.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes.hint,
				children: t.unavailable
			});
			if (!writable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: classes.hint,
				children: t.readOnly
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: classes.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: classes.desc,
						children: t.desc
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: classes.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: classes.blockTitle,
							children: t.globalTitle
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KvEditor, {
							t,
							rows: globalRows,
							setRows: setGlobalRows,
							basePath: ["global"],
							onChange,
							addLabel: t.headerName
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: classes.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: classes.blockTitle,
							children: t.providerTitle
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupEditor, {
							t,
							groups: providerGroups,
							setGroups: setProviderGroups,
							basePath: ["providers"],
							onChange,
							keyPlaceholder: t.providerPlaceholder,
							addLabel: t.providerPlaceholder
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: classes.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: classes.blockTitle,
							children: t.modelTitle
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupEditor, {
							t,
							groups: modelGroups,
							setGroups: setModelGroups,
							basePath: ["models"],
							onChange,
							keyPlaceholder: t.modelPlaceholder,
							addLabel: t.modelPlaceholder
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/scope.ts
		/**
		* dsh-llm-headers — 客户端设置作用域。命名空间 'dsh-llm-headers' 的读写通道：
		*  读：api.settings.describe({}) → 命中本 ns 的 view（value/revision/base/user）
		*  写：api.settings.mutate({ns, ops, expectedRevision})（带修订号防并发丢失）
		* 变更推送到 host 半边后由 host 重载三层表（settings/document-updated）。
		* 镜像官方 SettingsScopeController 的队列 / 修订 / 恢复契约（裁剪到本需求）。
		*/
		/** 本插件自有的 settings 命名空间（host 半边注册同名命名空间）。 */
		const NAMESPACE = "dsh-llm-headers";
		var HeadersScope = class {
			api;
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "loading",
				value: void 0,
				revision: void 0,
				writable: false
			});
			tail = Promise.resolve();
			readGeneration = 0;
			writeGeneration = 0;
			disposed = false;
			constructor(api) {
				this.api = api;
				this.load();
			}
			getSnapshot() {
				return this.store.getSnapshot();
			}
			subscribe(listener) {
				return this.store.subscribe(listener);
			}
			/** 排队一次刷新；较新的读或用户写会抑制过期发布。 */
			load() {
				const generation = ++this.readGeneration;
				return this.enqueue(() => this.read(generation));
			}
			/** 设置一个键值：任意深度路径（[layer, key] 或 [layer, groupKey, headerName]）。 */
			setPath(path, value) {
				if (path.length === 0 || value.length === 0) return Promise.resolve();
				return this.write({
					op: "set",
					path,
					value
				});
			}
			/** 删除一个键：同样任意深度。 */
			unsetPath(...path) {
				if (path.length === 0) return Promise.resolve();
				return this.write({
					op: "unset",
					path
				});
			}
			write(op) {
				this.readGeneration += 1;
				const generation = ++this.writeGeneration;
				return this.enqueue(async () => {
					const revision = this.getSnapshot().revision;
					try {
						const response = await this.api.settings.mutate({
							ns: NAMESPACE,
							ops: [op],
							...revision === void 0 ? {} : { expectedRevision: revision }
						});
						if (!response.result.ok) {
							if (!this.disposed && generation === this.writeGeneration) await this.read(++this.readGeneration);
							return;
						}
						this.accept(response.result.value, generation === this.writeGeneration);
					} catch (_settingsWriteFailure) {
						if (!this.disposed && generation === this.writeGeneration) await this.read(++this.readGeneration);
					}
				});
			}
			async dispose() {
				this.disposed = true;
				this.readGeneration += 1;
				this.writeGeneration += 1;
				await this.tail;
			}
			enqueue(operation) {
				if (this.disposed) return Promise.resolve();
				const task = this.tail.then(async () => {
					if (this.disposed) return;
					await operation();
				});
				this.tail = task.catch(() => {});
				return task;
			}
			async read(generation) {
				try {
					const response = await this.api.settings.describe({});
					if (!response.result.ok || this.disposed) return;
					const { namespaces, writable } = response.result.value;
					const view = namespaces.find((candidate) => candidate.ns === NAMESPACE);
					if (view === void 0) {
						if (generation === this.readGeneration) this.store.update((draft) => {
							draft.status = "unavailable";
							draft.writable = writable;
						});
						return;
					}
					this.accept(view, generation === this.readGeneration, writable);
				} catch (_settingsReadFailure) {}
			}
			accept(view, publish, writable) {
				this.store.update((draft) => {
					draft.revision = view.revision;
					draft.writable = writable ?? draft.writable;
					if (!publish) return;
					const value = view.value;
					draft.value = typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
					draft.status = "ready";
				});
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			nav: "请求头",
			desc: "为模型请求注入自定义 HTTP 请求头。优先级：模型 > 提供方 > 全局。默认不覆盖请求已有的同名头。",
			globalTitle: "全局请求头",
			providerTitle: "按提供方",
			modelTitle: "按模型",
			empty: "暂未配置",
			add: "添加",
			remove: "删除",
			headerName: "头名",
			headerValue: "值",
			headerAction: "操作",
			providerPlaceholder: "提供方 id，如 acme-gateway",
			modelPlaceholder: "provider/model，如 acme-gateway/gpt-5",
			readOnly: "当前连接为只读",
			loading: "加载中…",
			unavailable: "命名空间不可用",
			saveError: "保存失败",
			saved: "已保存"
		};
		const en = {
			nav: "Request Headers",
			desc: "Inject custom HTTP headers into model requests. Precedence: model > provider > global. Existing same-name headers are kept by default.",
			globalTitle: "Global headers",
			providerTitle: "Per provider",
			modelTitle: "Per model",
			empty: "Nothing configured",
			add: "Add",
			remove: "Remove",
			headerName: "Name",
			headerValue: "Value",
			headerAction: "Action",
			providerPlaceholder: "provider id, e.g. acme-gateway",
			modelPlaceholder: "provider/model, e.g. acme-gateway/gpt-5",
			readOnly: "Connection is read-only",
			loading: "Loading…",
			unavailable: "Namespace unavailable",
			saveError: "Save failed",
			saved: "Saved"
		};
		//#endregion
		//#region src/client/index.ts
		/** 本文案命名空间。 */
		const NS = "request-headers";
		/** 必需服务（cordis 注入）。目标插槽由 ui-settings 声明，注册依赖 slots.inject()。 */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* 区块一旦注册即绑定自身 store 并保持推送刷新：
		* 任何 settings/document-updated（不限本 ns，宽松起见）都会触发 scope 重读。
		* @param ctx - 客户端根上下文。
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-llm-headers: copy dictionaries");
			const connection = ctx.get("connection");
			const scope = new HeadersScope(connection.api);
			const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(scope.store);
			const t = ctx.locale.bind(NS);
			const injected = () => ({
				scope,
				useSnapshot,
				api: connection.api,
				t
			});
			ctx.effect(() => {
				const refresh = () => {
					scope.load();
				};
				const disposers = [ctx.remote.$on("settings/document-updated", (ns) => {
					if (ns === void 0 || ns === "dsh-llm-headers") refresh();
				}), ctx.on("connection/reset", refresh)];
				return () => {
					for (const dispose of disposers) dispose();
					scope.dispose();
				};
			}, "dsh-llm-headers: pushed invalidations");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "request-headers",
				order: 30,
				label: () => t("nav"),
				inject: injected
			}, HeadersSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map