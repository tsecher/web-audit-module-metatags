import {AbstractPuppeteerJourneyModule} from 'web_audit/dist/journey/AbstractPuppeteerJourneyModule.js';
import {PuppeteerJourneyEvents} from 'web_audit/dist/journey/AbstractPuppeteerJourney.js';
import {ModuleEvents} from 'web_audit/dist/modules/ModuleInterface.js';
import schema from "./metatags.schema.json" with {type: "json"};

/**
 * Metatags Module events.
 */
export const MetatagsModuleEvents = {
	createMetatagsModule: 'metatags_module__createMetatagsModule',
	beforeAnalyse: 'metatags_module__beforeAnalyse',
	onResult: 'metatags_module__onResult',
	onResultDetail: 'metatags_module__onResultDetail',
	afterAnalyse: 'metatags_module__afterAnalyse',
};

/**
 * Metatags.
 */
export default class MetatagsModule extends AbstractPuppeteerJourneyModule {
	get name() {
		return 'Metatags';
	}

	get id() {
		return `metatags`;
	}

	contextsData = {};

	/**
	 * {@inheritdoc}
	 */
	async init(context) {
		this.context = context;
		// Install Metatags store.
		this.context.config.storage?.installSchema(this, this.context);

		// Emit.
		this.context.eventBus.emit(MetatagsModuleEvents.createMetatagsModule, {module: this});
	}

	/**
	 * {@inheritdoc}
	 */
	initEvents(journey) {
		journey.on(PuppeteerJourneyEvents.JOURNEY_START, async (data) => {
		    this.contextsData = [];
		});
		journey.on(PuppeteerJourneyEvents.JOURNEY_NEW_CONTEXT, async (data) => {
		    this.contextsData[data.name] = await this.getContextData(data);
		});
	}

	/**
	 * Return context data
	 */
	async getContextData(data) {
		return data.wrapper.page.evaluate(() => {
			return {
			  h1:            document.querySelector('h1')?.innerText?.trim() || '',
			  metatag_title:         document.querySelector('title')?.innerText?.trim() || '',
			  canonical_url:     document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
			  og_title:       document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
			  og_description: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
			  og_image:       document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
			};
		});
	}

	/**
	 * {@inheritdoc}
	 */
	async analyse(urlWrapper) {
		this.context?.eventBus.emit(ModuleEvents.startsComputing, {module: this});

		for (const contextName in this.contextsData){
			if(contextName){
				this.analyseContext(contextName, this.contextsData[contextName], urlWrapper);
			}
		}
		this.context?.eventBus.emit(ModuleEvents.endsComputing, {module: this});
		return true;
	}


	/**
	 * Analyse a context.
	 *
	 * @param {string} contextName
	 * @param {UrlWrapper} urlWrapper
	 */
	analyseContext(contextName, urlWrapper) {

		const eventData = {
			module: this,
			url: urlWrapper,
		};
		this.context?.eventBus.emit(SeoLightModuleEvents.beforeAnalyse, eventData);
		this.context?.eventBus.emit(ModuleEvents.beforeAnalyse, eventData);

		// Summary.
		eventData.result = {
			url: urlWrapper.url.toString(),
			context: contextName,
			...contextReport
		};

		this.context?.eventBus.emit(SeoLightModuleEvents.onResult, eventData);
		this.context?.config?.logger.result(`SeoLight`, eventData.result, urlWrapper.url.toString());
		this.context?.config?.storage?.add(this, 'seo_light', this.context, eventData.result);
		this.context?.eventBus.emit(ModuleEvents.afterAnalyse, eventData);
		this.context?.eventBus.emit(SeoLightModuleEvents.afterAnalyse, eventData);

	}

	/**
	 * {@inheritdoc}
	 */
	getSchema() {
		return schema;
	}

}
