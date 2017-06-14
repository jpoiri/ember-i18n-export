# ember-i18n-export

This npm package consolidates [ember-i18n](https://github.com/jamesarosen/ember-i18n) translation files into a single csv file, This is useful when sending translations to a translation department. This npm package also produce a separate file that contains meta data about translations such number of words and number of translation keys.

## Installing
```code
npm install ember-i18n-export
```    
    
## Usage
Run the following command from the root of your project: 
```code
ember-i18n-export <options>
```
    
## Options

### inputDir
By default the translations are looked up from the <b>app/locales</b> folder, you can override this by using the <code>inputDir</code> option.
```code
ember-i18n-export --inputDir locale/translations
```

### inputFile
By default the translations are looked up from the <b>translation.js</b> file, you can override this by using the <code>inputFile</code> option.
```code
ember-i18n-export --inputFile trans.js
```

### outputDir

By default the csv files ar generated in the <b>i18n-exports</b> folder, you can override this by using the <code>outputDir</code> option:

```code
ember-i18n-export --outputDir locale-translations
```

### outputFile

By default the csv file containing the consolidates translations is named <b>translation.csv</b>, you can override this by using the <code>outputFile</code> option:

```code
ember-i18n-export --outputFile translations-export.csv
```

### outputMetaDataFile

By default the csv file containing the meta data about the translations is named <b>translation-meta.csv</b>, you override this by using the <code>outputMetaDataFile</code> option:

```code
ember-i18n-export --outputMetaDataFile translations-export-meta.csv
```

### translationKeyColumnName

By default the translationKey is displayed as the <b>SYSTEM_KEY</b> in csv file, you can override this by using the <code>translationKeyColumnName</code>:

```code
ember-i18n-export --translationKeyColumnName TRANSLATION_KEY
```

### localeColumnNames

By default each locale is represented by the locale column in the csv file, you override by using the <code>localeColumnNames</code> option:

```code
ember-i18n-export --localeColumnNames {\"en\":\"English\",\"fr\":\"French\"}
```
