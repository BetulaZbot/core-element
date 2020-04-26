import EventEmitter from 'core-event'

export default class Base extends EventEmitter {
    packageExport(pkg) {
        return '__esModule' in pkg && pkg.__esModule === true && pkg.default || pkg
    }
}
