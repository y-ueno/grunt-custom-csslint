/*
 * grunt-custom-csslint
 * http://gruntjs.com/
 *
 * Copyright (c) 2015 Tim Branyen, contributors
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {
  grunt.registerMultiTask('custom_csslint', 'grunt-custom-csslint', function() {
    var csslint = require('csslint').CSSLint;
    var stripJsonComments = require('strip-json-comments');
    var fs = require('fs');
    var path = require('path');
    var _ = require('lodash');      // 関数型プログラミング用ライブラリ
    var chalk = require('chalk');   // 出力を色づけするライブラリ
    var execSync = require('child_process').execSync;
    var done = this.async();
    var errorCode = 1;
    var ruleset = {};
    var verbose = grunt.verbose;
    var externalOptions = {};
    var combinedResult = {};
    var options = this.options();
    var formatStyle = 'compact';
    var baseResult = 'report/csslint_base.txt';
    var absoluteFilePaths = options.absoluteFilePathsForFormatters || false;

    // Read CSSLint options from a specified csslintrc file.
    if (options.csslintrc) {
      var contents = grunt.file.read(options.csslintrc);
      externalOptions = JSON.parse(stripJsonComments(contents));
      // delete csslintrc option to not confuse csslint if a future release
      // implements a rule or options on its own
      delete options.csslintrc;
    }

    // merge external options with options specified in gruntfile
    options = _.assign(options, externalOptions);

    // if we have disabled explicitly unspecified rules
    var defaultDisabled = options['*'] === false;
    delete options['*'];

    csslint.getRules().forEach(function(rule) {
      if (options[rule.id] || !defaultDisabled) {
        ruleset[rule.id] = 1;
      }
    });

    for (var rule in options) {
      if (!options[rule]) {
        delete ruleset[rule];
      } else {
        ruleset[rule] = options[rule];
      }
    }
    var hadErrors = 0;
    if (this.filesSrc.length == 0) {
      grunt.log.errorlns(chalk.red('there is no files to exec csslint!'));
      return false;
    }
    // ファイル毎に処理を実行する
    this.filesSrc.forEach(function(filepath) {
      var file = grunt.file.read(filepath),
        message = 'Linting ' + chalk.cyan(filepath) + '...',
        result;

      // skip empty files
      if (file.length) {
        result = csslint.verify(file, ruleset);
        verbose.write(message);
        if (result.messages.length) {
          verbose.or.write(message);
          grunt.log.error();
        } else {
          verbose.ok();
        }

        // store combined result for later use with formatters
        combinedResult[filepath] = result;
      } else {
        grunt.log.writeln('Skipping empty file ' + chalk.cyan(filepath) + '.');
      }
    });

    var formatter = csslint.getFormatter(formatStyle);
    if (!formatter) {
      grunt.log.errorlns(chalk.red('formatter is not valid'));
      return false;
    }

    // 初期実行結果ファイルが存在しない場合
    if (!fs.existsSync(baseResult)) {
      grunt.log.writeln(chalk.cyan('creating initial file'));
      var output = formatter.startFormat();
      _.each(combinedResult, function (result, filename) {
        if (absoluteFilePaths) {
          filename = path.resolve(filename);
        }
        output += formatter.formatResults(result, filename, {});
      });
      output += formatter.endFormat();
      grunt.file.write(baseResult, output);
    }

    // 実行結果ファイルが存在する場合は削除し、新たに実行結果ファイルを作成
    if (fs.existsSync(options.dest)) {
      grunt.file.delete(options.dest);
    }
    var output = formatter.startFormat();
    _.each(combinedResult, function (result, filename) {
      if (absoluteFilePaths) {
        filename = path.resolve(filename);
      }
      output += formatter.formatResults(result, filename, {});
    });
    output += formatter.endFormat();
    grunt.file.write(options.dest, output);

    // 初期実行結果ファイルと実行結果ファイルの行数を比較する
    var resultErrorNum = "" + execSync('cat ' + options.dest + ' | grep -c ""');
    var baseErrorNum = "" + execSync('cat ' + baseResult + ' | grep -c ""');

    // 初期のエラー数より増えていたらエラーを出力
    if (resultErrorNum - baseErrorNum > 0) {
      var diff = grunt.util.spawn({
        cmd: 'diff',
        args: ['-u', '-b', baseResult, options.dest]
      }, function(error, result, code) {
        if (result.stderr) {
          // コマンド実行失敗
          grunt.log.errorlns(error);
          return false;
        } else {
          if (result.stdout) {
            grunt.log.errorlns(result.stdout);
            grunt.fail.warn('syntax error or coding violations', errorCode);
            return false;
          } else {
            grunt.log.ok( 'ok, no syntax error and no coding violations');
          }
        }
      });
    }
    grunt.log.ok( 'ok, no syntax error and no coding violations');
  });
};
