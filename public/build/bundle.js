var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.29.7' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /*! Fast Average Color | © 2020 Denis Seleznev | MIT License | https://github.com/fast-average-color/fast-average-color */
    function isIgnoredColor(arr, num, ignoredColor) {
        for (let i = 0; i < ignoredColor.length; i++) {
            const item = ignoredColor[i];
            if (arr[num] === item[0] && // red
                arr[num + 1] === item[1] && // green
                arr[num + 2] === item[2] && // blue
                arr[num + 3] === item[3] // alpha
            ) {
                return true;
            }
        }

        return false;
    }

    function dominantAlgorithm(arr, len, options) {
        const colorHash = {};
        const divider = 24;
        const ignoredColor = options.ignoredColor;

        for (let i = 0; i < len; i += options.step) {
            const red = arr[i];
            const green = arr[i + 1];
            const blue = arr[i + 2];
            const alpha = arr[i + 3];

            if (ignoredColor && isIgnoredColor(arr, i, ignoredColor)) {
                continue;
            }

            const key = Math.round(red / divider) + ',' +
                    Math.round(green / divider) + ',' +
                    Math.round(blue / divider);

            if (colorHash[key]) {
                colorHash[key] = [
                    colorHash[key][0] + red * alpha,
                    colorHash[key][1] + green * alpha,
                    colorHash[key][2] + blue * alpha,
                    colorHash[key][3] + alpha,
                    colorHash[key][4] + 1
                ];
            } else {
                colorHash[key] = [red * alpha, green * alpha, blue * alpha, alpha, 1];
            }
        }

        const buffer = Object.keys(colorHash)
            .map(key => colorHash[key])
            .sort((a, b) => {
                const countA = a[4];
                const countB = b[4];

                return countA > countB ?  -1 : countA === countB ? 0 : 1;
            });

        const max = buffer[0];

        const redTotal = max[0];
        const greenTotal = max[1];
        const blueTotal = max[2];

        const alphaTotal = max[3];
        const count = max[4];

        return alphaTotal ? [
            Math.round(redTotal / alphaTotal),
            Math.round(greenTotal / alphaTotal),
            Math.round(blueTotal / alphaTotal),
            Math.round(alphaTotal / count)
        ] : options.defaultColor;
    }

    function simpleAlgorithm(arr, len, options) {
        let redTotal = 0;
        let greenTotal = 0;
        let blueTotal = 0;
        let alphaTotal = 0;
        let count = 0;

        const ignoredColor = options.ignoredColor;

        for (let i = 0; i < len; i += options.step) {
            const alpha = arr[i + 3];
            const red = arr[i] * alpha;
            const green = arr[i + 1] * alpha;
            const blue = arr[i + 2] * alpha;

            if (ignoredColor && isIgnoredColor(arr, i, ignoredColor)) {
                continue;
            }

            redTotal += red;
            greenTotal += green;
            blueTotal += blue;
            alphaTotal += alpha;
            count++;
        }

        return alphaTotal ? [
            Math.round(redTotal / alphaTotal),
            Math.round(greenTotal / alphaTotal),
            Math.round(blueTotal / alphaTotal),
            Math.round(alphaTotal / count)
        ] : options.defaultColor;
    }

    function sqrtAlgorithm(arr, len, options) {
        let redTotal = 0;
        let greenTotal = 0;
        let blueTotal = 0;
        let alphaTotal = 0;
        let count = 0;

        const ignoredColor = options.ignoredColor;

        for (let i = 0; i < len; i += options.step) {
            const red = arr[i];
            const green = arr[i + 1];
            const blue = arr[i + 2];
            const alpha = arr[i + 3];

            if (ignoredColor && isIgnoredColor(arr, i, ignoredColor)) {
                continue;
            }

            redTotal += red * red * alpha;
            greenTotal += green * green * alpha;
            blueTotal += blue * blue * alpha;
            alphaTotal += alpha;
            count++;
        }

        return alphaTotal ? [
            Math.round(Math.sqrt(redTotal / alphaTotal)),
            Math.round(Math.sqrt(greenTotal / alphaTotal)),
            Math.round(Math.sqrt(blueTotal / alphaTotal)),
            Math.round(alphaTotal / count)
        ] : options.defaultColor;
    }

    const ERROR_PREFIX = 'FastAverageColor: ';

    class FastAverageColor {
        /**
         * Get asynchronously the average color from not loaded image.
         *
         * @param {HTMLImageElement | string | null} resource
         * @param {FastAverageColorOptions} [options]
         *
         * @returns {Promise<FastAverageColorOptions>}
         */
        getColorAsync(resource, options) {
            if (!resource) {
                return Promise.reject(Error(`${ERROR_PREFIX}call .getColorAsync() without resource.`));
            }

            if (typeof resource === 'string') {
                const img = new Image();
                img.crossOrigin = '';
                img.src = resource;
                return this._bindImageEvents(img, options);
            } else if (resource.complete) {
                const result = this.getColor(resource, options);
                return result.error ? Promise.reject(result.error) : Promise.resolve(result);
            } else {
                return this._bindImageEvents(resource, options);
            }
        }

        /**
         * Get the average color from images, videos and canvas.
         *
         * @param {HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null} resource
         * @param {FastAverageColorOptions} [options]
         *
         * @returns {FastAverageColorResult}
         */
        getColor(resource, options) {
            options = options || {};

            const defaultColor = this._getDefaultColor(options);

            if (!resource) {
                this._outputError(options, 'call .getColor(null) without resource.');

                return this.prepareResult(defaultColor);
            }

            const originalSize = this._getOriginalSize(resource);
            const size = this._prepareSizeAndPosition(originalSize, options);

            if (!size.srcWidth || !size.srcHeight || !size.destWidth || !size.destHeight) {
                this._outputError(options, `incorrect sizes for resource "${resource.src}".`);

                return this.prepareResult(defaultColor);
            }

            if (!this._ctx) {
                this._canvas = this._makeCanvas();
                this._ctx = this._canvas.getContext && this._canvas.getContext('2d');

                if (!this._ctx) {
                    this._outputError(options, 'Canvas Context 2D is not supported in this browser.');

                    return this.prepareResult(defaultColor);
                }
            }

            this._canvas.width = size.destWidth;
            this._canvas.height = size.destHeight;

            let value = defaultColor;

            try {
                this._ctx.clearRect(0, 0, size.destWidth, size.destHeight);
                this._ctx.drawImage(
                    resource,
                    size.srcLeft, size.srcTop,
                    size.srcWidth, size.srcHeight,
                    0, 0,
                    size.destWidth, size.destHeight
                );

                const bitmapData = this._ctx.getImageData(0, 0, size.destWidth, size.destHeight).data;
                value = this.getColorFromArray4(bitmapData, options);
            } catch (e) {
                this._outputError(options, `security error (CORS) for resource ${resource.src}.\nDetails: https://developer.mozilla.org/en/docs/Web/HTML/CORS_enabled_image`, e);
            }

            return this.prepareResult(value);
        }

        /**
         * Get the average color from a array when 1 pixel is 4 bytes.
         *
         * @param {number[]|Uint8Array|Uint8ClampedArray} arr
         * @param {Object} [options]
         * @param {string} [options.algorithm="sqrt"] "simple", "sqrt" or "dominant"
         * @param {number[]}  [options.defaultColor=[0, 0, 0, 0]] [red, green, blue, alpha]
         * @param {number[]}  [options.ignoredColor] [red, green, blue, alpha]
         * @param {number} [options.step=1]
         *
         * @returns {number[]} [red (0-255), green (0-255), blue (0-255), alpha (0-255)]
         */
        getColorFromArray4(arr, options) {
            options = options || {};

            const bytesPerPixel = 4;
            const arrLength = arr.length;
            const defaultColor = this._getDefaultColor(options);

            if (arrLength < bytesPerPixel) {
                return defaultColor;
            }

            const len = arrLength - arrLength % bytesPerPixel;
            const step = (options.step || 1) * bytesPerPixel;

            let algorithm;

            switch (options.algorithm || 'sqrt') {
                case 'simple':
                    algorithm = simpleAlgorithm;
                    break;
                case 'sqrt':
                    algorithm = sqrtAlgorithm;
                    break;
                case 'dominant':
                    algorithm = dominantAlgorithm;
                    break;
                default:
                    throw Error(`${ERROR_PREFIX}${options.algorithm} is unknown algorithm.`);
            }

            return algorithm(arr, len, {
                defaultColor,
                ignoredColor: this._prepareIgnoredColor(options.ignoredColor),
                step
            });
        }

        /**
         * Get color data from value ([r, g, b, a]).
         *
         * @param {number[]} value
         *
         * @returns {FastAverageColorResult}
         */
        prepareResult(value) {
            const rgb = value.slice(0, 3);
            const rgba = [].concat(rgb, value[3] / 255);
            const isDark = this._isDark(value);

            return {
                value,
                rgb: 'rgb(' + rgb.join(',') + ')',
                rgba: 'rgba(' + rgba.join(',') + ')',
                hex: this._arrayToHex(rgb),
                hexa: this._arrayToHex(value),
                isDark,
                isLight: !isDark
            };
        }

        _prepareIgnoredColor(color) {
            return Array.isArray(color) && !Array.isArray(color[0]) ?
                [[].concat(color)] :
                color;
        }

        /**
         * Destroy the instance.
         */
        destroy() {
            delete this._canvas;
            delete this._ctx;
        }

        _getDefaultColor(options) {
            return this._getOption(options, 'defaultColor', [0, 0, 0, 0]);
        }

        _getOption(options, name, defaultValue) {
            return typeof options[name] === 'undefined' ? defaultValue : options[name];
        }

        _prepareSizeAndPosition(originalSize, options) {
            const srcLeft = this._getOption(options, 'left', 0);
            const srcTop = this._getOption(options, 'top', 0);
            const srcWidth = this._getOption(options, 'width', originalSize.width);
            const srcHeight = this._getOption(options, 'height', originalSize.height);

            let destWidth = srcWidth;
            let destHeight = srcHeight;

            if (options.mode === 'precision') {
                return {
                    srcLeft,
                    srcTop,
                    srcWidth,
                    srcHeight,
                    destWidth,
                    destHeight
                };
            }

            const maxSize = 100;
            const minSize = 10;

            let factor;

            if (srcWidth > srcHeight) {
                factor = srcWidth / srcHeight;
                destWidth = maxSize;
                destHeight = Math.round(destWidth / factor);
            } else {
                factor = srcHeight / srcWidth;
                destHeight = maxSize;
                destWidth = Math.round(destHeight / factor);
            }

            if (
                destWidth > srcWidth || destHeight > srcHeight ||
                destWidth < minSize || destHeight < minSize
            ) {
                destWidth = srcWidth;
                destHeight = srcHeight;
            }

            return {
                srcLeft,
                srcTop,
                srcWidth,
                srcHeight,
                destWidth,
                destHeight
            };
        }

        _bindImageEvents(resource, options) {
            return new Promise((resolve, reject) => {
                const onload = () => {
                    unbindEvents();

                    const result = this.getColor(resource, options);

                    if (result.error) {
                        reject(result.error);
                    } else {
                        resolve(result);
                    }
                };

                const onerror = () => {
                    unbindEvents();

                    reject(Error(`${ERROR_PREFIX}Error loading image ${resource.src}.`));
                };

                const onabort = () => {
                    unbindEvents();

                    reject(Error(`${ERROR_PREFIX}Image "${resource.src}" loading aborted.`));
                };

                const unbindEvents = () => {
                    resource.removeEventListener('load', onload);
                    resource.removeEventListener('error', onerror);
                    resource.removeEventListener('abort', onabort);
                };

                resource.addEventListener('load', onload);
                resource.addEventListener('error', onerror);
                resource.addEventListener('abort', onabort);
            });
        }

        _getOriginalSize(resource) {
            if (resource instanceof HTMLImageElement) {
                return {
                    width: resource.naturalWidth,
                    height: resource.naturalHeight
                };
            }

            if (resource instanceof HTMLVideoElement) {
                return {
                    width: resource.videoWidth,
                    height: resource.videoHeight
                };
            }

            return {
                width: resource.width,
                height: resource.height
            };
        }

        _toHex(num) {
            const str = num.toString(16);

            return str.length === 1 ? '0' + str : str;
        }

        _arrayToHex(arr) {
            return '#' + arr.map(this._toHex).join('');
        }

        _isDark(color) {
            // http://www.w3.org/TR/AERT#color-contrast
            const result = (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000;

            return result < 128;
        }

        _makeCanvas() {
            return typeof window === 'undefined' ?
                new OffscreenCanvas(1, 1) :
                document.createElement('canvas');
        }

        _outputError(options, error, details) {
            if (!options.silent) {
                console.error(`${ERROR_PREFIX}${error}`);

                if (details) {
                    console.error(details);
                }
            }
        }
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function sort(values, comparator = ascending) {
      if (typeof values[Symbol.iterator] !== "function") throw new TypeError("values is not iterable");
      return Array.from(values).sort(comparator);
    }

    /* src/App.svelte generated by Svelte v3.29.7 */
    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	return child_ctx;
    }

    // (40:2) {#each files as file}
    function create_each_block_2(ctx) {
    	let img;
    	let img_src_value;

    	const block = {
    		c: function create() {
    			img = element("img");
    			attr_dev(img, "alt", "slice");
    			attr_dev(img, "class", "image-normal svelte-nueh6m");
    			if (img.src !== (img_src_value = URL.createObjectURL(/*file*/ ctx[11]))) attr_dev(img, "src", img_src_value);
    			add_location(img, file, 40, 3, 777);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, img, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*files*/ 1 && img.src !== (img_src_value = URL.createObjectURL(/*file*/ ctx[11]))) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(img);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(40:2) {#each files as file}",
    		ctx
    	});

    	return block;
    }

    // (45:2) {#each colors as color}
    function create_each_block_1(ctx) {
    	let div;
    	let div_style_value;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "style", div_style_value = "background-color: " + /*color*/ ctx[6]);
    			attr_dev(div, "class", "svelte-nueh6m");
    			add_location(div, file, 45, 3, 926);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*colors*/ 2 && div_style_value !== (div_style_value = "background-color: " + /*color*/ ctx[6])) {
    				attr_dev(div, "style", div_style_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(45:2) {#each colors as color}",
    		ctx
    	});

    	return block;
    }

    // (50:2) {#each sortedColors as color}
    function create_each_block(ctx) {
    	let div;
    	let div_style_value;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "style", div_style_value = "background-color: " + /*color*/ ctx[6]);
    			attr_dev(div, "class", "svelte-nueh6m");
    			add_location(div, file, 50, 3, 1054);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*sortedColors*/ 4 && div_style_value !== (div_style_value = "background-color: " + /*color*/ ctx[6])) {
    				attr_dev(div, "style", div_style_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(50:2) {#each sortedColors as color}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let main;
    	let input;
    	let t0;
    	let div0;
    	let t1;
    	let div1;
    	let t2;
    	let div2;
    	let mounted;
    	let dispose;
    	let each_value_2 = /*files*/ ctx[0];
    	validate_each_argument(each_value_2);
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*colors*/ ctx[1];
    	validate_each_argument(each_value_1);
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*sortedColors*/ ctx[2];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			main = element("main");
    			input = element("input");
    			t0 = space();
    			div0 = element("div");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t1 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t2 = space();
    			div2 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(input, "type", "file");
    			attr_dev(input, "accept", "image/png, image/jpeg");
    			input.multiple = true;
    			add_location(input, file, 36, 1, 620);
    			attr_dev(div0, "class", "image-container svelte-nueh6m");
    			add_location(div0, file, 38, 1, 720);
    			attr_dev(div1, "class", "image-container svelte-nueh6m");
    			add_location(div1, file, 43, 1, 867);
    			attr_dev(div2, "class", "image-container svelte-nueh6m");
    			add_location(div2, file, 48, 1, 989);
    			add_location(main, file, 35, 0, 612);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, input);
    			append_dev(main, t0);
    			append_dev(main, div0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div0, null);
    			}

    			append_dev(main, t1);
    			append_dev(main, div1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div1, null);
    			}

    			append_dev(main, t2);
    			append_dev(main, div2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "change", /*input_change_handler*/ ctx[4]),
    					listen_dev(input, "change", /*generateColors*/ ctx[3], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*URL, files*/ 1) {
    				each_value_2 = /*files*/ ctx[0];
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty & /*colors*/ 2) {
    				each_value_1 = /*colors*/ ctx[1];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*sortedColors*/ 4) {
    				each_value = /*sortedColors*/ ctx[2];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	const fac = new FastAverageColor();
    	let files = [];
    	let colors = [];
    	let sortedColors = [];

    	function generateColors() {
    		$$invalidate(1, colors = []);

    		for (const file of files) {
    			fac.getColorAsync(URL.createObjectURL(file)).then(color => {
    				$$invalidate(1, colors = [...colors, color.hex]);
    			});
    		}
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		files = this.files;
    		$$invalidate(0, files);
    	}

    	$$self.$capture_state = () => ({
    		FastAverageColor,
    		sort,
    		ascending,
    		fac,
    		files,
    		colors,
    		sortedColors,
    		generateColors
    	});

    	$$self.$inject_state = $$props => {
    		if ("files" in $$props) $$invalidate(0, files = $$props.files);
    		if ("colors" in $$props) $$invalidate(1, colors = $$props.colors);
    		if ("sortedColors" in $$props) $$invalidate(2, sortedColors = $$props.sortedColors);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*colors, sortedColors*/ 6) {
    			 ($$invalidate(2, sortedColors = [...colors]), sortedColors.sort(ascending));
    		}
    	};

    	return [files, colors, sortedColors, generateColors, input_change_handler];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
