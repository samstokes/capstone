import * as Preact from "preact"
import * as Widget from "./Widget"
import * as Reify from "../data/Reify"
import * as Link from "../data/Link"
import * as DataTransfer from "../logic/DataTransfer"
import { once, isUndefined, first } from "lodash"
import { AnyDoc, AnyEditDoc, ChangeFn } from "automerge/frontend"
import Content, {
  DocumentActor,
  FullyFormedMessage,
  DocumentCreated,
} from "./Content"
import Clipboard from "./Clipboard"
import Touch, { TouchEvent } from "./Touch"
import { AddToShelf, ShelfContentsRequested, SendShelfContents } from "./Shelf"
import Peers from "./Peers"

export interface Model {
  navStack: string[]
  identityUrl: string
  rootUrl: string
  shelfUrl: string
}

type WidgetMessage = DocumentCreated | AddToShelf
type InMessage = FullyFormedMessage<
  DocumentCreated | AddToShelf | ShelfContentsRequested
>
type OutMessage = DocumentCreated | AddToShelf | SendShelfContents

class WorkspaceActor extends DocumentActor<Model, InMessage, OutMessage> {
  async onMessage(message: InMessage) {
    switch (message.type) {
      case "AddToShelf": {
        this.emit({
          type: "AddToShelf",
          body: message.body,
          to: this.doc.shelfUrl,
        })
        break
      }
      case "ShelfContentsRequested": {
        const body = message.body || {}
        this.emit({
          type: "SendShelfContents",
          body: { recipientUrl: message.from, ...body },
          to: this.doc.shelfUrl,
        })
        break
      }
    }
  }
}

class Workspace extends Preact.Component<Widget.Props<Model, WidgetMessage>> {
  static reify(doc: AnyDoc): Model {
    return {
      identityUrl: Reify.string(doc.identityUrl),
      navStack: Reify.array(doc.navStack),
      rootUrl: Reify.string(doc.rootUrl),
      shelfUrl: Reify.link(doc.shelfUrl),
    }
  }

  get currentUrl() {
    return this.peek()
  }

  push = (url: string) => {
    this.props.change(doc => {
      doc.navStack.push(url)
      return doc
    })
  }

  pop = () => {
    // Don't pop the root url of the stack
    if (this.props.doc.navStack.length === 1) return
    this.props.change(doc => {
      doc.navStack.pop()
      return doc
    })
  }

  peek = () => {
    const { navStack } = this.props.doc
    return navStack[navStack.length - 1]
  }

  onPinchEnd = (event: TouchEvent) => {
    // Prevent popping the last item off the navStack on pinch end.
    if (event.scale > 1 || this.props.doc.navStack.length < 2) return
    this.pop()
  }

  onCopy = (e: ClipboardEvent) => {
    // If an element other than body has focus (e.g. a text card input),
    // don't interfere with normal behavior.
    if (document.activeElement !== document.body) {
      return
    }

    // Otherwise, prevent default behavior and copy the currently active/fullscreen
    // document url to the clipboard.
    e.preventDefault()
    const currentUrl = this.peek()
    e.clipboardData.setData("text/plain", currentUrl)
    console.log(`Copied current url to the clipboard: ${currentUrl}`)
  }

  onPaste = (e: ClipboardEvent) => {
    const urlPromises = this.importData(e.clipboardData)
    Promise.all(urlPromises).then(urls => {
      this.props.emit({ type: "AddToShelf", body: { urls } })
    })
  }

  importData(data: DataTransfer): Promise<string>[] {
    const prefixMap: { [k: string]: Function } = {
      image: async (item: DataTransferItem) =>
        this.addImage(await DataTransfer.extractAsDataURL(item)),
      text: async (item: DataTransferItem) =>
        this.addText(await DataTransfer.extractAsText(item)),
    }
    return DataTransfer.extractEntries(data)
      .filter(entry => {
        const typePrefix = first(entry.type.split("/"))
        return typePrefix && typePrefix in prefixMap
      })
      .map(entry => {
        const typePrefix: string = first(entry.type.split("/"))!
        return prefixMap[typePrefix](entry.item)
      })
  }

  async addText(content: string) {
    return this.addDoc("Text", doc => {
      doc.content = content.split("")
      return doc
    })
  }

  async addImage(src: string) {
    return this.addDoc("Image", doc => {
      doc.src = src
      return doc
    })
  }

  async addDoc(type: string, changeFn: ChangeFn<unknown>) {
    const url = await Content.create(type)

    const onOpen = (doc: AnyEditDoc) => {
      change(changeFn)
    }

    const change = Content.open(url, once(onOpen))
    return url
  }

  onTapPeer = (identityUrl: string) => {
    this.props.emit({ type: "AddToShelf", body: { url: identityUrl } })
  }

  render() {
    const { shelfUrl } = this.props.doc
    const currentUrl = this.peek()
    return (
      <Touch onPinchEnd={this.onPinchEnd}>
        <div class="Workspace" style={style.Workspace}>
          <Clipboard onCopy={this.onCopy} onPaste={this.onPaste} />
          <Content
            key={currentUrl}
            mode={this.props.mode}
            url={currentUrl}
            onNavigate={this.push}
          />
          <Content mode="embed" url={shelfUrl} />
          <div style={style.Peers}>
            <Peers onTapPeer={this.onTapPeer} />
          </div>
        </div>
      </Touch>
    )
  }
}

const style = {
  Workspace: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  Peers: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
  },
}

export default Widget.create(
  "Workspace",
  Workspace,
  Workspace.reify,
  WorkspaceActor,
)
