var program = require('commander');
var fs = require('fs');
var flatten = require('flat');
var csvWriter = require('csv-write-stream');
var wordCount = require('wordcount');
var arrayContains = require('array-contains');

var ENCODING = 'UTF-8';
var TRANSLATION_BASE_DIR = 'app/locales/';
var TRANSLATION_FILE_NAME = 'translations.js';
var OUTPUT_DIR  = 'i18n-exports';
var OUTPUT_FILE = 'i18n-exports/translations.csv';
var includeWordCount = true;

program
  .version('1.0.0')
  .option('--outputFile [outputFile]', 'The output csv file. Defaults to i18n-exports/translations.cvs')
  .option('--outputDir [outputDir]', 'The output directory. Defaults to i18n-exports directory')
  .option('--includeWordCount [includeWordCount]', 'Include word counts. Default to true')
  .parse(process.argv);

  	if (program.includeWordCount === "false") {
  		includeWordCount = false;
  	}

	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR);
	}

	fs.unlink(OUTPUT_FILE, (err) => {

		console.log('Generating translation export...')

		let writer = csvWriter();

		writer.pipe(fs.createWriteStream(OUTPUT_FILE, {
			defaultEncoding: 'binary',
		}));

		let translationMap = getTranslationMap();
		let translationKeys = getTranslationKeys(translationMap);

		writeRow(writer, null, translationMap);

		translationKeys.forEach(function (translationKey) {
			writeRow(writer, translationKey, translationMap);
		});

		writeRow(writer, null, translationMap);

		if (includeWordCount) {
			writeFooterRow(writer, translationMap);
		}

		writer.end();
	});


	function getLocales() {
		return fs.readdirSync(TRANSLATION_BASE_DIR).filter(function (file) {
			return fs.statSync(TRANSLATION_BASE_DIR + file).isDirectory();
		});
	}

	function getTranslations(data) {
		let translationsStartIndex = data.indexOf('{');
		let translationsEndIndex = data.lastIndexOf('}');
		if (translationsStartIndex < 0) {
			throw new Error('Unable to parse the translations.');
		}
		let translations = JSON.parse(data.substring(translationsStartIndex, translationsEndIndex + 1));
		if (!translations) {
			throw new Error('Unable to parse the translations.');
		}
		return translations;
	}

	function getFlattenTranslations(data) {
		// flatten JSON object.
		let flattenTranslations = flatten(getTranslations(data));
		if (!flattenTranslations) {
			throw new Error('Unable to flatten the translations.');
		}
		return flattenTranslations;
	}

	function getTranslationMap() {
		let locales = getLocales();
		let translationsMap = {};
		locales.forEach(function (locale) {
			let translationFilePath = `${TRANSLATION_BASE_DIR}${locale}/${TRANSLATION_FILE_NAME}`;
			if (fs.existsSync(translationFilePath)) {
				let data = fs.readFileSync(translationFilePath, ENCODING);
				translationsMap[locale] = getFlattenTranslations(data);
			} else {
				translationsMap[locale] = {};
			}
		});
		return translationsMap;
	}

	function getTranslationKeys(translationMap) {
		const translationKeys = [];
		for (let localeKey in translationMap) {
			if (translationMap.hasOwnProperty(localeKey)) {
				for (let translationKey in translationMap[localeKey]) {
					if (translationMap[localeKey].hasOwnProperty(translationKey)
						&& !arrayContains(translationKeys, translationKey)) {
						translationKeys.push(translationKey);
					}
				}
			}
		}
		return translationKeys;
	}

	function writeRow(writer, translationKey, translationMap) {
		let row = {
			SYSTEM_KEY: translationKey
		};
		for (let localeKey in translationMap) {
			if (translationMap.hasOwnProperty(localeKey)) {
				const translation = translationMap[localeKey][translationKey];
				row[localeKey.toUpperCase()] = translation;
				if (includeWordCount) {
					if (translation) {
                		row[`${localeKey.toUpperCase()}_WORD_COUNT`] = wordCount('' + translation);//
                	} else {
                		row[`${localeKey.toUpperCase()}_WORD_COUNT`] = null;
                	}
				}
			}
		}
		writer.write(row);
	}

	function writeFooterRow(writer, translationMap) {
		let row = {
			SYSTEM_KEY: ''
		};
		for (let localeKey in translationMap) {
			let localeWordCount = 0;
			if (translationMap.hasOwnProperty(localeKey)) {
				for (let translationKey in translationMap[localeKey]) {
					if (translationMap[localeKey].hasOwnProperty(translationKey)) {
						localeWordCount = localeWordCount + wordCount(translationMap[localeKey][translationKey]);
					}
				}
				row[localeKey.toUpperCase()] = '';
				row[`${localeKey.toUpperCase()}_WORD_COUNT`] = `Total words: ${localeWordCount} `;//
			}
		}
		writer.write(row);
	}
