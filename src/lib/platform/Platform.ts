import BaseClass from '../base/Base'

const type = (data: any): string => {
    const r: RegExp = /\[object (\w+)\]/
    const str: string = Object.prototype.toString.apply(data)
    return (r.test(str) && RegExp.$1 || '').toLowerCase()
}

export default abstract class Platform extends BaseClass {
    $config: any
    constructor() {
        super();
        this.config = this.config.bind(this)
    }
    //系统启动时加载
    use = (cb: any) => this.on('action:start', cb)
    //处理错误
    error = (cb: any) => this.on('error', cb)
    start = async ($app: any) => {
        //从文件中获取配置
        await this.initConfig();
        //启动附件
        await this.emit('action:start', $app)
        //启动项目
        if ('start' in $app) {
            return await $app.start()
        }
    }
    async initConfig() {
        let env = this.env()
        let platformConfig = await this.importConfig(env)
        this.$config = { ...this.$config, ...platformConfig }
    }
    abstract async import(param: any)
    abstract async curl(param: string)
    abstract env()
    abstract async importConfig(env)
    async config(...arg: any[]) {
        const [data] = [...arg]
        const [key, value] = [...arg]
        if (type(data) === 'object') {
            this.$config = { ...this.$config, ...data }
            return true
        }
        if (type(key) !== 'string') {
            throw new Error('platform:config:the type of key must be string')
        }
        let mapKey: string = key.split('.').map((name: string) => `["${name}"]`).join('')

        if (value === void 0) {
            const reader: Function = new Function('data', [
                `var ret = null`,
                `try{`,
                `    ret = data${mapKey}`,
                `}catch(e){}`,
                `return ret`
            ].join('\r'))
            return reader(this.$config)
        }
        const seter: Function = new Function('data', 'value', [
            `var status = false`,
            `try{`,
            `    status = !!(data${mapKey} = value)`,
            `}catch(e){}`,
            `return status`
        ].join(''))
        return seter(this.$config, value)
    }
    //处理包
    

}