# ember-i18n-export

This npm package is combines and export the [ember-i18n](https://github.com/jamesarosen/ember-i18n) translation files into a single CSV file. This also count the word of each translation key and create summary of many words per application. Useful when you need to send it to a translation department.

## Installing
    npm install ember-i18n-export
    
## Running
    ember-i18n-export <options>
    
## Options

### outputDir

By default the csv is generated in the i18n-exports folder of the root your application. You can change this by using the <code>outputDir</code> option:

```code
ember-i18n-export --outputDir locale-translations
```

### outputFile

By default the csv file generate is translation.csv. You can change this by using the <code>outputFile</code> option:

```code
ember-i18n-export --outputFile translations-export.csv
```

### showWordCount

By default the csv file contains a column to display the word count of each translation key. You can disabled this feature by using the <code>showWordCount</code> option:

```code
ember-i18n-export --showWordCount false
```

### translationKeyColumnName

By default the translationKey is displayed in column SYSTEM_KEY in csv. You can change this by using the <code>translationKeyColumnName</code>:

```code
ember-i18n-export --translationKeyColumnName TRANSLATION_KEY
```

### localeColumnNames

By default each locale is represented by the locale code in the csv file you override by using the <code>localeColumnNames</code> option:

```code
ember-i18n-export --localeColumnNames {\"en\":\"English\",\"fr\":\"French\"}
```
