interface Options {
  /**
   * backgroundColor — Creates a PNG with the given background color.
   * @default 'transparent'
   */
  backgroundColor?: string;
  /**
   * canvg - If canvg is passed in, it will be used to write svg to canvas. This
   * will allow support for Internet Explorer
   */
  canvg?: (
    canvas: HTMLCanvasElement,
    src: CanvasImageSource | string,
  ) => unknown;
  /**
   * encoderOptions - A Number between 0 and 1 indicating image quality.
   * @default 0.8
   */
  encoderOptions?: number;
  /**
   * encoderType - A DOMString indicating the image format.
   * @default "image/png"
   */
  encoderType?: string;
  /**
   * excludeCss - Exclude all CSS rules
   * @default false
   */
  excludeCss?: boolean;
  /**
   * excludeUnusedCss - Exclude CSS rules that don't match any elements in the
   * SVG.
   * @default false
   */
  excludeUnusedCss?: boolean;
  /**
   * fonts - A list of {text, url, format} objects the specify what fonts to
   * inline in the SVG. Omitting this option defaults to auto-detecting font
   * rules.
   */
  fonts?: FontInfo[];
  /**
   * height - Specify the image's height, and specify viewBox's height if
   * preserveViewBox is false. Defaults to the viewbox's height if given, or
   * the element's non-percentage height, or the element's bounding box's
   * height, or the element's CSS height, or the computed style's height, or 0.
   */
  height?: number;
  /**
   * left - Specify the viewbox's left position. Defaults to the viewbox's x if
   * given, or 0.
   */
  left?: number;
  /**
   * modifyCss - A function that takes a CSS rule's selector and properties and
   * returns a string of CSS. Supercedes selectorRemap and modifyStyle. Useful
   * for modifying properties only for certain CSS selectors.
   */
  modifyCss?: (selector: string, properties: string) => string;
  /**
   * modifyStyle - A function that takes a CSS rule's properties and returns a
   * string of CSS. Useful for modifying properties before they're inlined into
   * the SVG.
   */
  modifyStyle?: (properties: string) => string;
  /**
   * preserveViewBox - Preserves the original viewBox if given. Effectively
   * cause `left` and `top` to be ignored.
   * @default false
   */
  preserveViewBox?: boolean;
  /**
   * responsive
   * @default false
   */
  responsive?: boolean;
  /**
   * scale - Changes the resolution of the output PNG. Defaults to 1, the same
   * dimensions as the source SVG.
   * @default 1
   */
  scale?: number;
  /**
   * selectorRemap - A function that takes a CSS selector and produces its
   * replacement in the CSS that's inlined into the SVG. Useful if your SVG
   * style selectors are scoped by ancestor elements in your HTML document.
   */
  selectorRemap?: (selector: string) => string;
  /**
   * top - Specify the viewbox's top position. Defaults to the viewbox's y if
   * given, or 0.
   */
  top?: number;
  /**
   * width - Specify the image's width, and specify viewBox's width if
   * preserveViewBox is false. Defaults to the viewbox's width if given, or the
   * element's non-percentage width, or the element's bounding box's width, or
   * the element's CSS width, or the computed style's width, or 0.
   */
  width?: number;
}

type El = HTMLElement | SVGElement;
type FontInfo = { text: string, url: string, format: string }

type DoneFn = (
  img: string,
  width: number,
  height: number,
) => unknown;

const xmlNs = 'http://www.w3.org/2000/xmlns/';
const xhtmlNs = 'http://www.w3.org/1999/xhtml';
const svgNs = 'http://www.w3.org/2000/svg';
const doctype = '<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY nbsp "&#160;">]>';
const urlRegex = /url\(["']?(.+?)["']?\)/;
const fontFormats = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  otf: 'application/x-font-opentype',
  ttf: 'application/x-font-ttf',
  eot: 'application/vnd.ms-fontobject',
  sfnt: 'application/font-sfnt',
  svg: 'image/svg+xml'
};

const isElement = (obj: El) => obj instanceof HTMLElement || obj instanceof SVGElement;
const requireDomNode = (el: El) => {
  if (!isElement(el)) throw new Error(`an HTMLElement or SVGElement is required; got ${el}`);
};
const requireDomNodePromise = (el: El) =>
  new Promise<El>((resolve, reject) => {
    if (isElement(el)) resolve(el)
    else reject(new Error(`an HTMLElement or SVGElement is required; got ${el}`));
  })
const isExternal = (url: string) => url && url.lastIndexOf('http',0) === 0 && url.lastIndexOf(window.location.host) === -1;
const isInlined = (url: string) => url && url.startsWith('data:');

const getFontMimeTypeFromUrl = (fontUrl: string) => {
  const formats = Object.keys(fontFormats)
    .filter((extension) => fontUrl.indexOf(`.${extension}`) > 0)
    .map(extension => fontFormats[extension as keyof (typeof fontFormats)]);
  if (formats) return formats[0];
  console.error(`Unknown font format for ${fontUrl}. Fonts may not be working correctly.`);
  return 'application/octet-stream';
};

// eslint-disable-next-line
const arrayBufferToBase64 = (buffer: any) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

const getDimension = (el: El, clone: El, dim: 'width' | 'height') => {
  const v =
    (el instanceof SVGSVGElement && el.viewBox.baseVal?.[dim]) ||
    (clone.getAttribute(dim) !== null && !clone.getAttribute(dim)?.match(/%$/) && parseInt(clone.getAttribute(dim)!)) ||
    el.getBoundingClientRect()[dim] ||
    parseInt(clone.style[dim]) ||
    parseInt(window.getComputedStyle(el).getPropertyValue(dim));
  return typeof v === 'undefined' || v === null || isNaN(parseFloat(v as unknown as string)) ? 0 : v;
};

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const getDimensions = (el: El, clone: El, options: Partial<Rect>) => {
  // @ts-ignore
  const viewBox: SVGRect | null | undefined = el?.viewBox?.baseVal;
  const ret: Rect = {
    left: viewBox?.x ?? 0,
    top: viewBox?.y ?? 0,
    width: viewBox?.width ?? 0,
    height: viewBox?.height ?? 0,
    ...options,
  };
  if (ret.width && ret.height) return ret;
  if (el.tagName === 'svg') {
    ret.width = getDimension(el, clone, 'width');
    ret.height = getDimension(el, clone, 'height');
  } else if (el instanceof SVGGraphicsElement && el.getBBox) {
    const {x, y, width, height} = el.getBBox();
    ret.width = x + width;
    ret.height = y + height;
  }
  return ret;
};

const reEncode = (data: string | number | boolean) =>
  decodeURIComponent(
    encodeURIComponent(data)
      .replace(/%([0-9A-F]{2})/g, (match, p1) => {
        const c = String.fromCharCode(parseInt(p1, 16));
        return c === '%' ? '%25' : c;
      })
  );

const uriToBlob = (uri: string) => {
  const byteString = window.atob(uri.split(',')[1]);
  const mimeString = uri.split(',')[0].split(':')[1].split(';')[0]
  const buffer = new ArrayBuffer(byteString.length);
  const intArray = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    intArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], {type: mimeString});
};

const query = (el: El, selector: string) => {
  if (!selector) return;
  try {
    return el.querySelector(selector) || el.parentNode && el.parentNode.querySelector(selector);
  } catch(err) {
    console.warn(`Invalid CSS selector "${selector}"`, err);
  }
};

const detectCssFont = (rule: CSSRule, href: string) => {
  // Match CSS font-face rules to external links.
  // @font-face {
  //   src: local('Abel'), url(https://fonts.gstatic.com/s/abel/v6/UzN-iejR1VoXU2Oc-7LsbvesZW2xOQ-xsNqO47m55DA.woff2);
  // }
  const match = rule.cssText.match(urlRegex);
  const url = (match && match[1]) || '';
  if (!url || url.match(/^data:/) || url === 'about:blank') return;
  const fullUrl =
    url.startsWith('../') ? `${href}/../${url}`
    : url.startsWith('./') ? `${href}/.${url}`
    : url;
  return {
    text: rule.cssText,
    format: getFontMimeTypeFromUrl(fullUrl),
    url: fullUrl
  };
};

const inlineImages = (el: El) => Promise.all(
  Array.from(el.querySelectorAll('image')).map(image => {
    let href = image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || image.getAttribute('href');
    if (!href) return Promise.resolve(null);
    if (isInlined(href)) Promise.resolve(true);
    if (isExternal(href)) {
      href += (href.indexOf('?') === -1 ? '?' : '&') + 't=' + new Date().valueOf();
    }
    return new Promise<boolean>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = href;
      img.onerror = () => reject(new Error(`Could not load ${href}`));
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        image.setAttribute('href', dataURL);
        image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataURL);
        resolve(true);
      };
    });
  })
);

const cachedFonts: Record<string, string | null> = {};
const inlineFonts = (fonts: FontInfo[]) => Promise.all(
  fonts.map(font =>
    new Promise((resolve, reject) => {
      if (cachedFonts[font.url]) return resolve(cachedFonts[font.url]);

      const req = new XMLHttpRequest();
      req.addEventListener('load', () => {
        // TODO: it may also be worth it to wait until fonts are fully loaded before
        // attempting to rasterize them. (e.g. use https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet)
        const fontInBase64 = arrayBufferToBase64(req.response);
        const fontUri = font.text.replace(urlRegex, `url("data:${font.format};base64,${fontInBase64}")`)+'\n';
        cachedFonts[font.url] = fontUri;
        resolve(fontUri);
      });
      req.addEventListener('error', e => {
        console.warn(`Failed to load font from: ${font.url}`, e);
        cachedFonts[font.url] = null;
        resolve(null);
      });
      req.addEventListener('abort', e => {
        console.warn(`Aborted loading font from: ${font.url}`, e);
        resolve(null);
      });
      req.open('GET', font.url);
      req.responseType = 'arraybuffer';
      req.send();
    })
  )
).then(fontCss => fontCss.filter(x => x).join(''));

let cachedRules: { rules?: CSSRuleList | null, href?: string | null }[] = []
const styleSheetRules = () => {
  if (cachedRules.length) return cachedRules;
  return cachedRules = Array.from(document.styleSheets).map(sheet => {
    try {
      return {rules: sheet.cssRules, href: sheet.href};
    } catch (e) {
      console.warn(`Stylesheet could not be loaded: ${sheet.href}`, e);
      return {};
    }
  });
};

const inlineCss = (el: El, options?: Options) => {
  const {
    selectorRemap,
    modifyStyle,
    modifyCss,
    fonts,
    excludeUnusedCss
  } = options || {};
  const generateCss = modifyCss || ((selector, properties) => {
    const sel = selectorRemap ? selectorRemap(selector) : selector;
    const props = modifyStyle ? modifyStyle(properties) : properties;
    return `${sel}{${props}}\n`;
  });
  const css: string[] = [];
  const detectFonts = typeof fonts === 'undefined';
  const fontList = fonts || [];
  styleSheetRules().forEach(({rules, href}) => {
    if (!rules || !href) return;
    Array.from(rules).forEach(rule => {
      if (rule instanceof CSSStyleRule && typeof rule.style != 'undefined') {
        if (query(el, rule.selectorText)) css.push(generateCss(rule.selectorText, rule.style.cssText));
        else if (detectFonts && rule.cssText.match(/^@font-face/)) {
          const font = detectCssFont(rule, href);
          if (font) fontList.push(font);
        } else if (!excludeUnusedCss) {
          css.push(rule.cssText);
        }
      }
    });
  });

  return inlineFonts(fontList).then(fontCss => css.join('\n') + fontCss);
};

const downloadOptions = () => {
  if ((!('msSaveOrOpenBlob' in navigator) || !navigator.msSaveOrOpenBlob) && !('download' in document.createElement('a'))) {
    return {popup: window.open()!};
  }
};

const prepareSvg = (el: El, options?: Options, done?: DoneFn) => {
  requireDomNode(el);
  const {
    scale = 1,
    responsive = false,
    excludeCss = false,
    preserveViewBox = false,
  } = options || {};

  return inlineImages(el).then(() => {
    let clone = el.cloneNode(true) as El;
    clone.style.backgroundColor = (options || {}).backgroundColor || el.style.backgroundColor;
    const {left, top, width, height} = getDimensions(el, clone, options || {});

    if (el.tagName !== 'svg') {
      if (el instanceof SVGGraphicsElement) {
        const transform = clone.getAttribute('transform');
        if (transform != null) {
          clone.setAttribute('transform', transform.replace(/translate\(.*?\)/, ''));
        }
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.appendChild(clone);
        clone = svg;
      } else {
        throw new Error('Attempted to render non-SVG element\n' + el.toString());
      }
    }

    clone.setAttribute('version', '1.1');
    if (!preserveViewBox)
      clone.setAttribute('viewBox', [left, top, width, height].join(' '));
    if (!clone.getAttribute('xmlns')) clone.setAttributeNS(xmlNs, 'xmlns', svgNs);
    if (!clone.getAttribute('xmlns:xlink')) clone.setAttributeNS(xmlNs, 'xmlns:xlink', 'http://www.w3.org/1999/xlink');

    if (responsive) {
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    } else {
      clone.setAttribute('width', String(width * scale));
      clone.setAttribute('height', String(height * scale));
    }

    Array.from(clone.querySelectorAll('foreignObject > *')).forEach(foreignObject => {
      if (!foreignObject.getAttribute('xmlns'))
        foreignObject.setAttributeNS(xmlNs, 'xmlns', foreignObject.tagName === 'svg' ? svgNs : xhtmlNs);
    });

    if (excludeCss) {
      const outer = document.createElement('div');
      outer.appendChild(clone);
      const src = outer.innerHTML;
      if (typeof done === 'function') done(src, width, height);
      return {src, width, height};
    } else {
      return inlineCss(el, options).then(css => {
        const style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.innerHTML = `<![CDATA[\n${css}\n]]>`;

        const defs = document.createElement('defs');
        defs.appendChild(style);
        clone.insertBefore(defs, clone.firstChild);

        const outer = document.createElement('div');
        outer.appendChild(clone);
        const src = outer.innerHTML.replace(/NS\d+:href/gi, 'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href');

        if (typeof done === 'function') done(src, width, height);
        return {src, width, height};
      });
    }
  });
};

const svgAsDataUri = (el: El, options?: Options, done?: DoneFn) => {
  requireDomNode(el);
  return prepareSvg(el, options)
    .then(({src, width, height}) => {
        const svgXml = `data:image/svg+xml;base64,${window.btoa(reEncode(doctype+src))}`;
        if (typeof done === 'function') {
            done(svgXml, width, height);
        }
        return svgXml;
    });
};

const svgAsPngUri = (el: El, options?: Options, done?: DoneFn) => {
  requireDomNode(el);
  const {
    encoderType = 'image/png',
    encoderOptions = 0.8,
    canvg
  } = options || {};

  const convertToPng = ({ src, width, height }: {
    src: HTMLImageElement | string,
    width: number,
    height: number
  }) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (canvg) canvg(canvas, src);
    else context.drawImage(src as HTMLImageElement, 0, 0);

    let png: string;
    try {
      png = canvas.toDataURL(encoderType, encoderOptions);
    } catch (e) {
      // @ts-ignore
      if ((typeof SecurityError !== 'undefined' && e instanceof SecurityError) || e.name === 'SecurityError') {
        throw new Error( 'Rendered SVG images cannot be downloaded in this browser.');
      } else throw e;
    }
    if (typeof done === 'function') done(png, canvas.width, canvas.height);
    return Promise.resolve(png);
  }

  if (canvg) return prepareSvg(el, options).then(convertToPng);
  else return svgAsDataUri(el, options).then(uri => {
    return new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        resolve(convertToPng({
          src: image,
          width: image.width,
          height: image.height
        }));
      }
      image.onerror = () => {
        reject(`There was an error loading the data URI as an image on the following SVG\n${window.atob(uri.slice(26))}Open the following link to see browser's diagnosis\n${uri}`);
      }
      image.src = uri;
    })
  });
};

const download = (name: string, uri: string, options?: { popup: Window }) => {
  // @ts-ignore
  if (navigator.msSaveOrOpenBlob) navigator.msSaveOrOpenBlob(uriToBlob(uri), name);
  else {
    const saveLink = document.createElement('a');
    if ('download' in saveLink) {
      saveLink.download = name;
      saveLink.style.display = 'none';
      document.body.appendChild(saveLink);
      try {
        const blob = uriToBlob(uri);
        const url = URL.createObjectURL(blob);
        saveLink.href = url;
        saveLink.onclick = () => requestAnimationFrame(() => URL.revokeObjectURL(url));
      } catch (e) {
        console.error(e);
        console.warn('Error while getting object URL. Falling back to string URL.');
        saveLink.href = uri;
      }
      saveLink.click();
      document.body.removeChild(saveLink);
    } else if (options && options.popup) {
      options.popup.document.title = name;
      options.popup.location.replace(uri);
    }
  }
};

const saveSvg = (el: El, name: string, options?: Options) => {
  const downloadOpts = downloadOptions(); // don't inline, can't be async
  return requireDomNodePromise(el)
    .then(el => svgAsDataUri(el, options || {}))
    .then(uri => download(name, uri, downloadOpts));
};

const saveSvgAsPng = (el: El, name: string, options?: Options) => {
  const downloadOpts = downloadOptions(); // don't inline, can't be async
  return requireDomNodePromise(el)
    .then(el => svgAsPngUri(el, options || {}))
    .then(uri => download(name, uri, downloadOpts));
};

export {
  prepareSvg,
  svgAsDataUri,
  svgAsPngUri,
  download,
  saveSvg,
  saveSvgAsPng,
};
