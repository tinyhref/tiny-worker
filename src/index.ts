enum ACTION_TYPE {
  GLOBAL = 'global'
}

enum WORKER_NAME {
  MAIN = 'main'
}

enum WORKER_TYPE {
  MODULE = 'module'
}

type AnyWorker = Worker | SharedWorker;
type ImportsType = string[] | Record<string, string>;

interface WorkerMessage {
  action: ACTION_TYPE;
  payload: {
    id: string | null;
    method?: string;
    args?: any[];
    result?: any;
    error?: string;
    workerName?: string;
    isModule?: boolean;
  };
}

interface CallbackPair {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

interface TinyWorkerOptions {
  methods: Record<string, any>;
  imports?: ImportsType;
  isSharedWorker?: boolean;
  workerType?: WorkerType;
}

interface EventCallback {
  (data?: any): void;
}

interface EventMap {
  [eventName: string]: EventCallback[];
}

declare const workerMethods: any;

class TinyWorkerClass {
  private static sdk: TinyWorkerClass | undefined;
  public worker: AnyWorker | null = null;
  private callbacks: Record<string, CallbackPair> = {};
  private counter: number = 0;
  private events: EventMap = {};

  static instance(): TinyWorkerClass {
    if (!this.sdk) {
      this.sdk = new TinyWorkerClass();
    }

    return this.sdk;
  }

  constructor(options?: TinyWorkerOptions) {
    if (options) {
      this.init(options);
    }
  }

  init(options: TinyWorkerOptions): TinyWorkerClass['worker'] {
    if (!this.worker) {
      this.createWorker(WORKER_NAME.MAIN, options);
    }

    return this.worker
  }

  createWorker(workerName: string, options: TinyWorkerOptions): TinyWorkerClass['worker'] {
    const { methods, imports, isSharedWorker, workerType } = options;

    if (!methods) {
      throw new Error('methods required');
    }

    if (workerName === WORKER_NAME.MAIN) {
      if (this.worker) {
        return this.worker;
      }
    }

    if ((this as any)[workerName]) {
      return (this as any)[workerName]
    }

    const isModule = workerType === WORKER_TYPE.MODULE;

    let importScripts = '';

    if (imports) {
      importScripts = `${this.importScripts(imports, { isModule })}\n`;
    }
    const workerCode = `${importScripts}${this.serializeToString(methods, { isModule })} \n\n self.${isSharedWorker ? 'onconnect' : 'onmessage'} = ${this[isSharedWorker ? 'onMessageSharedWorker' : 'onMessageWorker'].toString().trim()}`;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerOptions: WorkerOptions = {};
    if (workerType) {
      workerOptions.type = workerType;
    }
    const worker = isSharedWorker ? new SharedWorker(URL.createObjectURL(blob), workerOptions) : new Worker(URL.createObjectURL(blob), workerOptions);

    if (worker instanceof SharedWorker) {
      worker.port.start();
    }

    (worker as any).destroy = () => this.destroy(worker, workerName);
    this.addEventListener(worker);

    if (workerName === WORKER_NAME.MAIN) {
      this.worker = worker;
      this.expose(workerName, {
        methods,
        isModule
      });
      return this.worker
    }

    (this as any)[workerName] = worker;
    this.expose(workerName, {
      methods,
      isModule
    });
    return (this as any)[workerName]
  }

  addEventListener(worker: AnyWorker) {
    if (worker instanceof SharedWorker) {
      worker.port?.addEventListener('message', this.onMessage);
    } else {
      worker?.addEventListener('message', this.onMessage);
    }
  }

  onMessageSharedWorker = (e: MessageEvent): void => {
    const port = e.ports[0];

    port.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as WorkerMessage;

      const { action, payload } = data;

      const id = payload.id;

      if (action !== ACTION_TYPE.GLOBAL || !id) {
        return;
      }

      const method = payload.method;
      const args = payload.args || [];
      const workerName = payload.workerName;
      const isModule = payload.isModule;

      if (method) {
        const func = isModule ? workerMethods[method] : (self as any)[method];

        if (typeof func === 'function') {
          try {
            const result = func(...args);

            if (result instanceof Promise) {
              result.then((response) => {
                port.postMessage({
                  action: ACTION_TYPE.GLOBAL,
                  payload: { id, method, result: response, workerName }
                });
              })
            } else {
              port.postMessage({
                action: ACTION_TYPE.GLOBAL,
                payload: { id, method, result, workerName }
              });
            }
          } catch (err) {
            port.postMessage({
              action: ACTION_TYPE.GLOBAL,
              payload: { id, method, error: '' + err }
            });
          }
        }
      } else {
        port.postMessage({
          action: ACTION_TYPE.GLOBAL,
          payload: { id, method, error: 'NO_SUCH_METHOD' }
        });
      }
    });

    port.start();
  }

  onMessageWorker = (event: MessageEvent): void => {
    const data = event.data as WorkerMessage;

    const { action, payload } = data;

    const id = payload.id;

    if (action !== ACTION_TYPE.GLOBAL || !id) {
      return;
    }

    const method = payload.method;
    const args = payload.args || [];
    const workerName = payload.workerName;
    const isModule = payload.isModule;

    if (method) {
      const func = isModule ? workerMethods[method] : (self as any)[method];

      if (typeof func === 'function') {
        try {
          const result = func(...args);

          if (result instanceof Promise) {
            result.then((response) => {
              self.postMessage({
                action: ACTION_TYPE.GLOBAL,
                payload: { id, method, result: response, workerName }
              });
            })
          } else {
            self.postMessage({
              action: ACTION_TYPE.GLOBAL,
              payload: { id, method, result, workerName }
            });
          }
        } catch (err) {
          self.postMessage({
            action: ACTION_TYPE.GLOBAL,
            payload: { id, method, error: '' + err }
          });
        }
      }
    } else {
      self.postMessage({
        action: ACTION_TYPE.GLOBAL,
        payload: { id, method, error: 'NO_SUCH_METHOD' }
      });
    }
  }

  onMessage = (event: MessageEvent): void => {
    const data = event.data as WorkerMessage;

    const { action, payload } = data;

    const id = payload.id;

    if (action !== ACTION_TYPE.GLOBAL || !id) {
      return;
    }

    const result = payload.result;
    const workerName = payload.workerName;
    const error = payload.error;

    const callback = this.callbacks[id];

    if (!callback) {
      throw Error(`Unknown callback ${id}`);
    }

    const method = payload.method;

    if (method) {
      if (workerName) {
        this.emit(`${workerName}/${method}`, result);
      } else {
        this.emit(method, result);
      }
    }

    const { resolve, reject } = callback;

    delete this.callbacks[id];

    if (error) {
      reject(Error(error));
    } else {
      resolve(result);
    }
  }

  expose(workerName: string, params: { methods: Record<string, any>, isModule?: boolean }): void {
    const methods = params?.methods;
    const isModule = params?.isModule;

    if (workerName === WORKER_NAME.MAIN) {
      if (!this.worker) {
        return;
      }

      for (const method in methods) {
        if (!(method in this.worker)) {
          const value = methods[method];

          if (typeof value === 'function') {
            (this.worker as any)[method] = (...args: any[]): Promise<any> => {
              return new Promise((resolve, reject) => {
                const id = `rpc${++this.counter}`;
                this.callbacks[id] = {
                  resolve,
                  reject
                };

                if (this.worker) {
                  this.postMessage(this.worker, {
                    action: ACTION_TYPE.GLOBAL,
                    payload: {
                      id,
                      method,
                      args,
                      isModule
                    }
                  });
                }
              });
            };
          }
        }
      }

      return;
    }

    if (!(this as any)[workerName]) {
      return;
    }

    for (const method in methods) {
      if (!(method in (this as any)[workerName])) {
        const value = methods[method];

        if (typeof value === 'function') {
          ((this as any)[workerName] as any)[method] = (...args: any[]): Promise<any> => {
            return new Promise((resolve, reject) => {
              const id = `rpc${++this.counter}`;
              this.callbacks[id] = {
                resolve,
                reject
              };

              if ((this as any)[workerName]) {
                this.postMessage((this as any)[workerName], {
                  action: ACTION_TYPE.GLOBAL,
                  payload: {
                    id,
                    method,
                    args,
                    workerName,
                    isModule
                  }
                })
              }
            });
          };
        }
      }
    }
  }

  postMessage(worker: AnyWorker, data: any) {
    if (worker instanceof SharedWorker) {
      worker.port?.postMessage(data)
    } else {
      worker?.postMessage(data)
    }
  }

  serializeToString(methods: Record<string, any> = {}, params?: { isModule?: boolean }): string {
    const isModule = params?.isModule;

    const methodsString = Object.entries(methods)
    .map(([key, value]) => {
      if (typeof value === 'function') {
        const raw = value.toString().trim();
        const isAsync = raw.startsWith('async');
        const asyncString = isAsync ? 'async ' : '';

        if (raw.startsWith('function')) {
          const newValue = raw.replace(/^function\s*/, `function `);

          if (isModule) {
            return `${key}: ${newValue}`
          }

          return `${key} = ${newValue};`;
        }

        if (raw.includes('=>')) {
          if (isModule) {
            return `${key}: ${raw}`
          }

          return `${key} = ${raw};`;
        }

        const argsMatch = raw.match(/\(([^)]*)\)/);
        const bodyMatch = raw.match(/{([\s\S]*)}$/);

        const args = argsMatch?.[1]?.trim() ?? '';
        const body = bodyMatch?.[1]?.trim() ?? '';

        const newValue = `(${args}) {\n${body}\n}`;

        if (isModule) {
          return `${key}: ${asyncString}function ${newValue}`;
        }

        return `${asyncString}function ${key}${newValue}`;
      }

      const newValue = `${JSON.stringify(value)}`;

      if (isModule) {
        return `${key}: ${newValue}`
      }

      return `${key} = ${newValue};`;
    })
    .join(isModule ? ',\n' : '\n\n');

    if (isModule) {
      return `const workerMethods = {\n${methodsString}\n}`
    }

    return methodsString
  }

  importScripts(imports: ImportsType, params?: { isModule?: boolean }) {
    const isModule = params?.isModule;

    let script = '';

    if (Array.isArray(imports)) {
      imports.forEach((name: string) => {
        if (name.startsWith('http') || name.startsWith('/') || name.startsWith('./') || name.startsWith('../')) {
          script += `importScripts("${name}");\n`
        }
      });
    } else {
      Object.keys(imports).forEach((name: string) => {
        const value = imports[name];

        if (value.startsWith('http') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
          script += isModule ? `import ${name} from "${value}";\n` : `importScripts("${value}");\n`
        }
      })
    }

    return script
  }

  destroy(worker: AnyWorker, workerName: string): void {
    if (worker instanceof SharedWorker) {
      worker.port?.removeEventListener('message', this.onMessage);
      worker.port?.close();
    } else {
      worker?.removeEventListener('message', this.onMessage);
      worker?.terminate();
    }

    if (workerName === WORKER_NAME.MAIN) {
      this.worker = null;
      return;
    }

    (this as any)[workerName] = null;
  }

  on(eventName: string, callback: EventCallback): void {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  off(eventName: string, callback?: EventCallback): void {
    if (!this.events[eventName]) {
      return
    }

    if (!callback) {
      delete this.events[eventName];
    } else {
      this.events[eventName] = this.events[eventName].filter((cb) => cb !== callback);

      if (this.events[eventName].length === 0) {
        delete this.events[eventName];
      }
    }
  }

  emit(eventName: string, data?: any): void {
    if (!this.events[eventName]) {
      return
    }

    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    });
  }
}

export const TinyWorker = TinyWorkerClass.instance();

export default TinyWorker;