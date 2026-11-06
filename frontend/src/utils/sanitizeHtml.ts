const BLOCKED_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'meta',
  'base',
  'link',
  'form',
]

const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction']

function isUnsafeUrlValue(rawValue: string): boolean {
  const normalized = rawValue.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase()
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:application/xhtml')
  ) {
    return true
  }
  return false
}

export function parseSanitizedHtmlDocument(rawHtml: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml || '', 'text/html')

  for (const selector of BLOCKED_TAGS) {
    doc.querySelectorAll(selector).forEach((node) => node.remove())
  }

  const allElements = doc.body.querySelectorAll('*')
  allElements.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value || ''

      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name)
        continue
      }

      if (URL_ATTRIBUTES.includes(name) && isUnsafeUrlValue(value)) {
        el.removeAttribute(attr.name)
        continue
      }

      if (name === 'style') {
        const lowerStyle = value.toLowerCase()
        if (lowerStyle.includes('expression(') || lowerStyle.includes('javascript:') || lowerStyle.includes('vbscript:')) {
          el.removeAttribute(attr.name)
        }
      }
    }
  })

  return doc
}

export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml) return ''
  const doc = parseSanitizedHtmlDocument(rawHtml)
  return doc.body.innerHTML
}

export function setSafeElementHtml(target: HTMLElement | null, rawHtml: string): void {
  if (!target) return
  const doc = parseSanitizedHtmlDocument(rawHtml || '')
  const safeNodes = Array.from(doc.body.childNodes).map((node) => document.importNode(node, true))
  target.replaceChildren(...safeNodes)
}
