import {AbstractPuppeteerJourneyModule} from 'web_audit/dist/journey/AbstractPuppeteerJourneyModule.js';
import {PuppeteerJourneyEvents} from 'web_audit/dist/journey/AbstractPuppeteerJourney.js';
import {ModuleEvents} from 'web_audit/dist/modules/ModuleInterface.js';
import schema from "./hn_structure.schema.json" with {type: "json"};

/**
 * HnStructure Module events.
 */
export const HnStructureModuleEvents = {
	createHnStructureModule: 'hn_structure_module__createHnStructureModule',
	beforeAnalyse: 'hn_structure_module__beforeAnalyse',
	onResult: 'hn_structure_module__onResult',
	onResultDetail: 'hn_structure_module__onResultDetail',
	afterAnalyse: 'hn_structure_module__afterAnalyse',
};

const MAX_HEADING_LENGTH = 70; // au-delà : avertissement


/**
 * HnStructure.
 */
export default class HnStructureModule extends AbstractPuppeteerJourneyModule {
	get name() {
		return 'Structure Hn';
	}

	get id() {
		return `hn_structure`;
	}

	contextsData = {};

	/**
	 * {@inheritdoc}
	 */
	async init(context) {
		this.context = context;
		// Install HnStructure store.
		this.context.config.storage?.installSchema(this, this.context);

		// Emit.
		this.context.eventBus.emit(HnStructureModuleEvents.createHnStructureModule, {module: this});
	}

	/**
	 * {@inheritdoc}
	 */
	initEvents(journey) {
		journey.on(PuppeteerJourneyEvents.JOURNEY_START, async (data) => {
			this.contextsData = [];
		});
		journey.on(PuppeteerJourneyEvents.JOURNEY_END_CONTEXT, async (data) => {
			this.contextsData[data.name] = await this.getContextData(data);
		});
	}

	/**
	 * Return context data
	 */
	async getContextData(data) {
		return data.wrapper.page.evaluate(() => {
			const isVisible = (el) => {
				if (typeof el.checkVisibility === 'function') {
					return el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true});
				}
				const style = getComputedStyle(el);
				return (
					style.display !== 'none' &&
					style.visibility !== 'hidden' &&
					el.getClientRects().length > 0
				);
			};

			const getText = (el) => {
				// textContent + alt des images (cas d'un titre composé uniquement d'une image)
				let text = el.textContent || '';
				if (!text.trim()) {
					text = [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ');
				}
				return text.replace(/\s+/g, ' ').trim();
			};

			const nodes = document.querySelectorAll(
				'h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]'
			);

			return [...nodes].map((el, index) => {
				const isNative = /^H[1-6]$/.test(el.tagName);
				const level = isNative
					? parseInt(el.tagName[1], 10)
					: parseInt(el.getAttribute('aria-level'), 10);

				return {
					index,
					tag: isNative ? el.tagName.toLowerCase() : `${el.tagName.toLowerCase()}[role=heading]`,
					level,
					text: getText(el),
					visible: isVisible(el),
				};
			});
		});
	}

	/**
	 * {@inheritdoc}
	 */
	async analyse(urlWrapper) {
		this.context?.eventBus.emit(ModuleEvents.startsComputing, {module: this});

		for (const contextName in this.contextsData) {
			if (contextName) {
				this.analyseContext(contextName, this.contextsData[contextName], urlWrapper);
			}
		}
		this.context?.eventBus.emit(ModuleEvents.endsComputing, {module: this});
		return true;
	}


	/**
	 * Analyse a context.
	 */
	analyseContext(contextName, contextReport, urlWrapper) {

		const eventData = {
			module: this,
			url: urlWrapper,
		};
		this.context?.eventBus.emit(HnStructureModuleEvents.beforeAnalyse, eventData);
		this.context?.eventBus.emit(ModuleEvents.beforeAnalyse, eventData);

		// Summary.
		const {errors, warnings} = this.getErrors(contextReport);
		eventData.result = {
			url: urlWrapper.url.toString(),
			context: contextName,
			isValid: errors.length < 1 ? 1 : 0,
			...this.getCountHn(contextReport),
		};

		this.context?.eventBus.emit(HnStructureModuleEvents.onResult, eventData);
		this.context?.eventBus.emit(ModuleEvents.onAnalyseSummary, {
			module: this,
			group_id: `hn_structure`,
			url: urlWrapper,
			summary: eventData.result
		});




		this.context?.config?.storage?.add(this, 'hn_structure', this.context, eventData.result);
		this.context?.config?.storage?.add(this, 'hn_structure_details', this.context, {
			url: urlWrapper.url.toString(),
			context: contextName,
			details: this.renderStructure(contextReport),
			errors: `"${errors.join(`\r\n`).split('"').join('\'')}"`,
			warnings: `"${warnings.join(`\r\n`).split('"').join('\'')}"`,
		});

		this.context?.eventBus.emit(ModuleEvents.afterAnalyse, eventData);
		this.context?.eventBus.emit(HnStructureModuleEvents.afterAnalyse, eventData);
	}

	getErrors(headings) {
		const errors = [];
		const warnings = [];
		const label = (h) => `<${h.tag}> "${h.text || '(empty)'}"`;

		if (headings.length === 0) {
			errors.push('No Hn found.');
			return { errors, warnings };
		}

		// On ne valide la hiérarchie que sur les titres visibles
		const visible = headings.filter((h) => h.visible);
		const hidden = headings.filter((h) => !h.visible);

		if (hidden.length > 0) {
			warnings.push(
				`${hidden.length} hidden title : ` +
				hidden.map(label).join(', ')
			);
		}

		if (visible.length === 0) {
			errors.push('No visible titles on page.');
			return { errors, warnings };
		}

		// Règle 1 : un et un seul H1
		const h1s = visible.filter((h) => h.level === 1);
		if (h1s.length === 0) {
			errors.push('No <h1> visible : The page needs a h1.');
		} else if (h1s.length > 1) {
			errors.push(
				`${h1s.length} <h1> found (only one needed) : ${h1s.map(label).join(', ')}`
			);
		}

		// Règle 2 : le premier titre doit être un H1
		if (visible[0].level !== 1) {
			errors.push(`The first title of the page is ${label(visible[0])} instead of  <h1>.`);
		}

		// Règle 3 : pas de saut de niveau descendant (ex : h2 -> h4)
		for (let i = 1; i < visible.length; i++) {
			const prev = visible[i - 1];
			const curr = visible[i];
			if (curr.level > prev.level + 1) {
				errors.push(
					`Level error : ${label(prev)} followed by ${label(curr)} ` +
					`(h${prev.level} → h${curr.level}).`
				);
			}
		}

		// Règle 4 : pas de titre empty
		visible
			.filter((h) => !h.text)
			.forEach((h) => errors.push(`Empty title : <${h.tag}> (position ${h.index + 1}).`));

		// Avertissements : titres trop longs
		visible
			.filter((h) => h.text.length > MAX_HEADING_LENGTH)
			.forEach((h) =>
				warnings.push(`Title too long (${h.text.length} characters) : ${label(h)}`)
			);

		// Avertissements : titres en double au même niveau
		const seen = new Map();
		visible.forEach((h) => {
			if (!h.text) return;
			const key = `${h.level}|${h.text.toLowerCase()}`;
			seen.set(key, (seen.get(key) || 0) + 1);
		});
		for (const [key, count] of seen) {
			if (count > 1) {
				const [level, text] = key.split('|');
				warnings.push(`Double title (${count}×) level h${level} : "${text}"`);
			}
		}

		return { errors, warnings };
	}

	getCountHn(contextData) {
		const data = {};
		contextData.forEach((item) => {
			data[`h${item.level}`] = data[`h${item.level}`] || 0;
			data[`h${item.level}`] += 1;
		});
		return data;
	}

	/**
	 * {@inheritdoc}
	 */
	getSchema() {
		return schema;
	}

	renderStructure(contextReport) {
		let content = ''
		contextReport.forEach((h) => {
			const indent = '  '.repeat(Math.max(h.level - 1, 0));
			const hiddenFlag = h.visible ? '' : '  (hidden)';
			content += `${indent}h${h.level}  ${h.text || '(empty)'}${hiddenFlag}\n`;
		});

		return '"' + content.split('"').join('\'') + '"';
	}
}
