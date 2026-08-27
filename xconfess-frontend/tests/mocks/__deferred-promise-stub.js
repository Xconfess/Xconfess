class DeferredPromise extends Promise {
  constructor(executor) {
    let _resolve, _reject;
    super((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
      if (executor) executor(resolve, reject);
    });
    this.resolve = _resolve;
    this.reject = _reject;
  }
}

function createDeferredExecutor() {
  let resolve, reject;
  const executor = (res, rej) => { resolve = res; reject = rej; };
  executor.resolve = (...args) => resolve(...args);
  executor.reject = (...args) => reject(...args);
  return executor;
}

module.exports = { DeferredPromise, createDeferredExecutor };
