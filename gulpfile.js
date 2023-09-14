import gulp from 'gulp'
import { deleteSync } from 'del'
import fileinclude from 'gulp-file-include'
import htmlmin from 'gulp-htmlmin'
import * as dartSass from 'sass'
import gulpSass from 'gulp-sass'
import imagemin from 'gulp-imagemin'
import imageminSvgo from 'imagemin-svgo'
import sourcemaps from 'gulp-sourcemaps'
import fs from 'fs'
import through from 'through2'
import named from 'vinyl-named'
import webpack from 'webpack-stream'
import replace from 'gulp-replace'
const sass = gulpSass(dartSass)
let packageJson
let domain

const paths = {
  html: {
    src: 'src/*.html',
    dest: 'dist/'
  },
  htmlinclude: 'src/include/*.html',
  img: {
    src: 'src/assets/img/*',
    dest: 'dist/assets/img/'
  },
  cloudflareMeta: {
    src: 'src/_*',
    dest: 'dist/'
  },
  js: {
    src: 'src/assets/js/app.js',
    dest: 'dist/assets/js/'
  },
  json: {
    src: 'src/*.json',
    dest: 'dist/'
  },
  scss: {
    src: 'src/assets/scss/*.scss',
    dest: 'dist/assets/css/'
  }
}

// Get Package information from package.json
async function getPackageInfo() {
  packageJson = JSON.parse(fs.readFileSync('package.json'))
  domain = process.env.DOMAIN || ''
  if (domain.startsWith('https://')) {
    domain = domain.substring(8)
  }

  return Promise.resolve()
}

// Wipe the dist directory
export async function clean() {
  return deleteSync(['dist/'])
}

// Minify HTML
async function html() {
  return gulp
    .src(paths.html.src)
    .pipe(fileinclude({ prefix: '@@', basepath: 'src/include/' }))
    .pipe(replace('{{commit-hash}}', process.env.CF_PAGES_COMMIT_SHA))
    .pipe(replace('{{branch-name}}', process.env.CF_PAGES_BRANCH))
    .pipe(replace('{{environment}}', process.env.CF_PAGES_BRANCH === 'main' ? 'production' : 'development'))
    .pipe(replace('{{sentry-dsn}}', process.env.SENTRY_DSN))
    .pipe(replace('{{domain}}', domain))
    .pipe(replace('{{link-to-dash}}', process.env.LINK_TO_DASH ? '<a href="dash">Manage</a>' : ''))
    .pipe(replace('{{package-name}}', packageJson.name))
    .pipe(replace('{{package-version}}', packageJson.version))
    .pipe(
      htmlmin({
        collapseBooleanAttributes: true,
        collapseWhitespace: true,
        includeAutoGeneratedTags: false,
        minifyURLs: true,
        removeAttributeQuotes: true,
        removeComments: true,
        removeEmptyAttributes: true,
        removeRedundantAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true
      })
    )
    .pipe(gulp.dest(paths.html.dest))
}

// Minify JavaScript
async function js() {
  return gulp
    .src(paths.js.src)
    .pipe(named())
    .pipe(
      webpack({
        devtool: 'source-map',
        mode: 'production',
        module: {
          rules: [
            {
              test: /\.js$/i,
              loader: 'string-replace-loader',
              options: {
                multiple: [
                  { search: '{{commit-hash}}', replace: process.env.CF_PAGES_COMMIT_SHA },
                  { search: '{{branch-name}}', replace: process.env.CF_PAGES_BRANCH },
                  {
                    search: '{{environment}}',
                    replace: process.env.CF_PAGES_BRANCH === 'main' ? 'production' : 'development'
                  },
                  { search: '{{sentry-dsn}}', replace: process.env.SENTRY_DSN },
                  { search: '{{domain}}', replace: domain },
                  { search: '{{package-name}}', replace: packageJson.name },
                  { search: '{{package-version}}', replace: packageJson.version }
                ]
              }
            }
          ]
        }
      })
    )
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(
      through.obj(function (file, enc, cba) {
        // Dont pipe through any source map files. They will be handled by gulp-sourcemaps.
        if (!/\.map$/.test(file.path)) {
          this.push(file)
        }
        cba()
      })
    )
    .pipe(sourcemaps.write('.', { addComment: false }))
    .pipe(gulp.dest(paths.js.dest))
}

// Compile SCSS
async function scss() {
  return gulp
    .src(paths.scss.src)
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(gulp.dest(paths.scss.dest))
}

// Move JSON
async function json() {
  return gulp.src(paths.json.src).pipe(gulp.dest(paths.json.dest))
}

// Copy Cloudflare Pages Meta Info
async function cloudflareMeta(cb) {
  return gulp.src(paths.cloudflareMeta.src).pipe(gulp.dest(paths.cloudflareMeta.dest))
}

// Compress images
async function img() {
  return gulp
    .src(paths.img.src)
    .pipe(imagemin([imageminSvgo()]))
    .pipe(gulp.dest(paths.img.dest))
}

// Watch for changes
function watchSrc() {
  console.warn('Watching for changes... Press [CTRL+C] to stop.')
  gulp.watch([paths.html.src, paths.htmlinclude], html)
  gulp.watch(paths.scss.src, scss)
  gulp.watch(paths.img.src, img)
  gulp.watch(paths.js.src, js)
}

export default gulp.series(getPackageInfo, cloudflareMeta, js, img, scss, json, html)

export const watch = gulp.series(getPackageInfo, watchSrc)
