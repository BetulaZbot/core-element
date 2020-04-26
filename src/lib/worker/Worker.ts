import * as is from 'is'
import BaseClass from '../base/Base'
class KeepAlive extends BaseClass {
    RECORD = {}
    async set(name, state) {
        this.RECORD[name] = state
        // return await this.emit(`${$elementName}:${name}`, state)
    }
    async get(name, $elementName) {
        if (this.RECORD[name] !== void 0) {
            return this.RECORD[name]
        }
        return await new Promise(r => {
            this.once(`${$elementName}:${name}`, r)
        })
    }
    clear() {
        this.RECORD = {}
    }
}

interface interceptorParams {
    before?: Function,
    after?: Function
}
export class Worker extends BaseClass {
    $config: any
    $platform: any
    $recordList: string[]
    constructor(config: any, platform: any) {
        super()
        this.$config = config
        this.$platform = platform
    }

    async curl(name: string, data?: any, headers?: any, strategy?: any) {
        //判断环境
        let env: string = this.$platform && is.function(this.$platform.env) && this.$platform.env() || 'prd'

        const { remote, mock } = this.$config.config
        //如果是开发环境,尝试加载mook数据文件
        if (/dev/.test(env) && mock) {
            let mookRst: string | any = (await mock())[name]
            if (mookRst)
                return mookRst
        }
        let info: string | any = remote[name]
        headers = headers || {}
        data = data || {}
        let params: any = {
            data,
            headers,
            strategy
        }
        let appId: string
        const r: RegExp = /^(([^!]+)!)?((.+)@)?((GET|POST|DELETE|INPUT):)?(.+)$/i
        if (is.function(info)) {
            info = await info(this.$platform.env())
        }
        if (is.string(info) && r.test(<string>info)) {
            params = Object.assign(params, {
                methods: RegExp.$6,
                dataType: RegExp.$2,
                url: RegExp.$7
            })
            appId = RegExp.$4
        } else if (is.object(info)) {
            appId = <any>info.appId
            params = Object.assign(params, {
                methods: <any>info.methods,
                dataType: <any>info.dataType,
                url: <any>info.url,
                postMessage: <any>info.postMessage
            })
        }


        let system = await this.$platform.config(`API.systemList.${appId}`)
        if (!system) {
            throw new Error(`worker:curl:can not find the API:API.systemList.${appId}`)
        }
        const urlObject = {
            host: system.host,
            pathname: params.url,
            port: system.port,
            protocol: system.protocol
        }

        let interceptor: interceptorParams = await this.$platform.config(`HTTP.interceptor.API.${appId}`) || {}

        params.url = (() => {
            let url: string = `/${(urlObject.pathname || '').replace(/^\/+/, '')}`
            let urlPrefix: string = ''
            if (urlObject.host) {
                urlPrefix = [
                    `${urlObject.protocol || 'http'}://`,
                    `${urlObject.host}`,
                    urlObject.port ? `:${urlObject.port}` : ''
                ].join('')
            }
            return `${urlPrefix}${url}`
        })()
        if (is.function(interceptor.before)) {
            await interceptor.before(params)
        }
        let res: any

        res = await this.$platform.curl(params)

        if (is.function(interceptor.after)) {
            await interceptor.after(res)
        }
        return res
    }
}
export class WorkerManger extends BaseClass {

    $config: any
    $rule: RegExp = /(([^@]+)@)?([^:]+):(\w+)/
    // $combine: any
    $keep: any
    // $proxy: any
    $platform: any
    $elementName: string
    constructor(config, platform, elementName) {
        super()
        this.$platform = platform;
        this.$config = config
        // this.$combine = {}
        this.$keep = new KeepAlive()
        // this.$proxy = new $Proxy(config.proxy)
        this.$elementName = elementName
    }

    config(name: string) {
        let mapKey = name.split('.').map(n => `['${n}']`).join('')
        let get: Function = new Function('data', [
            `var ret = null`,
            `try{`,
            `   ret = data${mapKey}`,
            `}catch(e){}`,
            `return ret`
        ].join('\n\r'))
        return get(this.$config.config)
    }
    /**
     * 获取记录
     *  */
    record(name) {
        return this.$keep.get(name, this.$elementName)
    }
    clearRecord() {
        this.$keep.clear()
    }
    /**
     * 访问器
     * @param key 
     * @param arg 
     */
    async commit(key: string, ...arg: Array<any>): Promise<any> {
        const r: RegExp = this.$rule
        if (!r.test(key)) {
            throw new Error('worker:commit:Illegal entry')
        }
        const groupName: string = RegExp.$3
        const actionName: string = RegExp.$4
        const setting = this.$config.worker[groupName]
        let ctrl: any = await this.packageExport(setting)
        if (!is.function(ctrl)) {
            throw new Error('worker:commit:worker must be class')
        }

        const ctrlObject: any = new ctrl(this.$config, this.$platform)
        ctrlObject.$worker = this
        const action: any = ctrlObject[actionName]
        // const $_keep_alive_status = ctrl.$_keep_alive_status || action && action.$_keep_alive_status
        const res: any = is.function(action) ? await <Function>action.call(ctrlObject, ...arg) : null
        // if ($_keep_alive_status === true) {
        ctrlObject.$recordList && ctrlObject.$recordList.includes(actionName) && this.$keep.set(key, res)
        // }
        this.emit(`${this.$elementName}:${key}`, res)

        return res
    }

    listen(name: string, type: string, listener) {
        if (['on', 'once', 'subscribe'].includes(type)) {
            this[type](`${this.$elementName}:${name}`, listener)
        } else {
            throw new Error("worker:listen:type error")
        }

    }
}
/**
 * 保持状态
 * worker修饰
 * */
function recordRst() {

    return (target: Object,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>) => {
        if (!target["$recordList"]) {
            target["$recordList"] = [propertyKey]
        } else {
            target["$recordList"].push(propertyKey);
        }
        return descriptor;
    }


}
export { recordRst }
// export const keepAlive = cls => {
//     cls.$_keep_alive_status = true
//     return (param?) => {
//         let actions = param && param.actions
//         if (!Array.isArray(actions)) {
//             return cls
//         }
//         cls.$_keep_alive_status = false
//         actions.forEach(name => {
//             if (!is.function(cls.prototype[name])) {
//                 return
//             }
//             cls.prototype[name].$_keep_alive_status = true
//         })
//         return cls
//     }

// }
