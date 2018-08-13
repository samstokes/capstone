import * as Preact from "preact"
import * as Link from "../data/Link"
import { AnyDoc, Doc } from "automerge"
import Store from "../data/Store"

interface Widget extends Preact.Component<{ url: string; view: View }, any> {}

export type WidgetClass<T> = {
  new (...k: any[]): Widget
  decode(doc: AnyDoc): T
}

export type View = "default" | "preview"

export interface Props {
  url: string
  view?: View
}

export default class Content extends Preact.Component<Props & unknown> {
  static registry: { [type: string]: WidgetClass<any> } = {}

  static store: Store

  /// Decoding helpers:

  static link(type: string, existing: any): string {
    return typeof existing === "string" ? existing : this.create(type)
  }

  static array<T>(existing: any): Array<T> {
    return Array.isArray(existing) ? existing : []
  }

  static number(existing: any, def: number): number {
    return typeof existing === "number" ? existing : def
  }

  static string(existing: any, def: string): string {
    return typeof existing === "string" ? existing : def
  }

  /// Registry:

  // Creates an initialized document of the given type and returns its URL
  static create(type: string): string {
    const doc = this.store.create(this.find(type).decode)
    return Link.format({ type, id: doc._actorId })
  }

  // Opens an initialized document at the given URL
  static open<T>(url: string): Doc<T> {
    const { type, id } = Link.parse(url)
    const widget = this.find(type)
    const doc = this.store.open(id)

    return doc && this.store.decode(doc, "Migrate", widget.decode)
  }

  static register(type: string, component: WidgetClass<any>) {
    this.registry[type] = component
  }

  static find(type: string): WidgetClass<any> {
    const widget = this.registry[type]
    if (!widget) throw new Error(`Widget not found in registry: '${type}'`)

    return widget
  }

  get registry() {
    return Content.registry
  }

  render() {
    const { url, type } = Link.parse(this.props.url)
    const Widget = Content.find(type)
    const view = this.props.view || "default"

    if (!Widget) {
      return <Missing type={type} />
    }

    return <Widget url={url} view={view} {...this.props} />
  }
}

export class Missing extends Preact.Component<{ type: string }> {
  render() {
    return <div>'{this.props.type}' not found in Content.registry</div>
  }
}
