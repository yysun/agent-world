declare module 'pino/browser' {
  import * as pino from 'pino';

  function pinoBrowser(options?: pino.LoggerOptions): pino.Logger;

  export = pinoBrowser;
}
