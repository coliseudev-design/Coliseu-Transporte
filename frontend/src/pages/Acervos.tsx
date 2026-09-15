import { useState, useEffect, useRef } from 'react'
import { useApiQuery } from '../hooks/useApi'
import api from '../services/api'
import {
  FileText, Plus, Trash2, Edit2, Play, Check, X, Search, Filter, HelpCircle,
  Eye, FileSpreadsheet, Send, Copy, AlertCircle, Info, Download,
  Bold, Italic, Smile, Image, Paperclip, Sparkles, Wand2, Loader2, Maximize2, Minimize2, Code,
  Upload, FileCode, CheckCircle2, Clipboard, FolderOpen
} from 'lucide-react'

interface Template {
  id: number;
  nome: string;
  categoria: string;
  conteudo: string;
  imagem_url?: string | null;
  subcategoria?: string | null;
  created_at: string;
  updated_at: string;
}

export default function Acervos() {
  useEffect(() => {
    document.title = "Acervos de Templates - Coliseu Transporte"
  }, [])
  const [selectedCategory, setSelectedCategory] = useState<string>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  
  // Form State
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('Mensagem WhatsApp')
  const [formContent, setFormContent] = useState('')
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formSubcategory, setFormSubcategory] = useState('marketing')
  const [isEmojiOpen, setIsEmojiOpen] = useState(false)
  
  // AI Generator State
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [useDefaultLayout, setUseDefaultLayout] = useState(true)

  // Creation Mode: IA vs Importar HTML Pronto
  const [creationMode, setCreationMode] = useState<'ai' | 'import_html'>('ai')
  const [importedHtmlCode, setImportedHtmlCode] = useState('')
  const [htmlImportFeedback, setHtmlImportFeedback] = useState<string | null>(null)
  const htmlFileInputRef = useRef<HTMLInputElement>(null)
  const fullscreenHtmlFileInputRef = useRef<HTMLInputElement>(null)

  // Editor Tab Mode & Toolbars Visibility State
  const [editorTab, setEditorTab] = useState<'visual' | 'code'>('visual')
  const [isEditingActive, setIsEditingActive] = useState(false)
  const [isEditorMaximized, setIsEditorMaximized] = useState(false)
  const visualEditorRef = useRef<HTMLDivElement>(null)

  // Fullscreen Preview & Edit State
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false)
  const [fullscreenTab, setFullscreenTab] = useState<'visual' | 'code'>('visual')
  const fullscreenVisualRef = useRef<HTMLDivElement>(null)

  // Ref para preservar posição do cursor/foco durante a digitação
  const lastFormContentRef = useRef<string>('')

  // Sincroniza o conteúdo HTML no editor em Tela Cheia no momento exato em que ele abre
  useEffect(() => {
    if (isFullscreenPreviewOpen) {
      setIsEditingActive(true)
      setTimeout(() => {
        if (fullscreenVisualRef.current) {
          fullscreenVisualRef.current.innerHTML = formContent || '<div style="padding: 30px; text-align: center; color: #94a3b8;"><p style="font-size: 16px; font-weight: 700;">Template Vazio.</p><p style="font-size: 13px;">Digite as instruções à esquerda e clique em ✨ Gerar Modelo com IA!</p></div>'
        }
      }, 50)
    }
  }, [isFullscreenPreviewOpen])

  // Sincroniza o conteúdo HTML nos editores visuais APENAS quando alterado externamente
  useEffect(() => {
    if (formContent !== lastFormContentRef.current) {
      lastFormContentRef.current = formContent || ''
      if (visualEditorRef.current && document.activeElement !== visualEditorRef.current) {
        visualEditorRef.current.innerHTML = formContent || ''
      }
      if (fullscreenVisualRef.current && document.activeElement !== fullscreenVisualRef.current) {
        fullscreenVisualRef.current.innerHTML = formContent || ''
      }
    }
  }, [formContent, editorTab, fullscreenTab])

  // Test Email Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false)
  const [testEmail, setTestEmail] = useState('contato@coliseusistemas.com.br')
  const [isSendingTest, setIsSendingTest] = useState(false)

  // Real-time Preview State
  const [previewHtml, setPreviewHtml] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Queries
  const { data: templatesRes, refetch: refetchTemplates } = useApiQuery<{ data: Template[] }>('/templates')
  const templates = templatesRes?.data || []

  // Filter categories
  const categories = [
    'Mensagem WhatsApp',
    'E-mail de Cobrança',
    'E-mail Marketing',
    'Contrato',
    'Proposta Comercial'
  ]

  const filteredTemplates = templates.filter(t => {
    const matchesCategory = selectedCategory === 'todos' || t.categoria === selectedCategory
    const matchesSearch = t.nome.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.conteudo.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Placeholder tags to insert
  const placeholders = [
    { tag: '{{nome_cliente}}', label: 'Nome do Cliente', desc: 'Razão social ou nome completo' },
    { tag: '{{cpf_cnpj}}', label: 'CPF/CNPJ', desc: 'Documento formatado do cliente' },
    { tag: '{{numero_documento}}', label: 'Nº Documento', desc: 'Código de identificação da cobrança' },
    { tag: '{{valor_total}}', label: 'Valor Total', desc: 'Valor total formatado em R$' },
    { tag: '{{data_vencimento}}', label: 'Vencimento', desc: 'Data limite para pagamento' },
    { tag: '{{dias_atraso}}', label: 'Dias de Atraso', desc: 'Quantidade de dias em aberto' },
    { tag: '{{link_pagamento}}', label: 'Link de Pagamento', desc: 'URL da fatura digital' },
    { tag: '{{data_atual}}', label: 'Data Atual', desc: 'Data do dia do disparo' },
    { tag: '{{nome_vendedor}}', label: 'Nome Vendedor', desc: 'Nome do operador responsável' }
  ]

  // Insert placeholder tag at cursor location (WYSIWYG ou Code)
  const handleInsertTag = (tag: string) => {
    if (isFullscreenPreviewOpen && fullscreenTab === 'visual' && fullscreenVisualRef.current) {
      fullscreenVisualRef.current.focus()
      restoreSelection()
      document.execCommand('insertHTML', false, `<span style="background-color: #e0e7ff; color: #3730a3; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${tag}</span> `)
      handleFullscreenVisualInput()
      return
    }

    if (editorTab === 'visual' && visualEditorRef.current) {
      visualEditorRef.current.focus()
      restoreSelection()
      document.execCommand('insertHTML', false, `<span style="background-color: #f3e8ff; color: #7e22ce; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${tag}</span> `)
      handleVisualInput()
      return
    }

    const txtarea = textareaRef.current
    if (txtarea) {
      const startPos = txtarea.selectionStart
      const endPos = txtarea.selectionEnd
      const currentText = formContent
      const updatedText = currentText.substring(0, startPos) + tag + currentText.substring(endPos)
      setFormContent(updatedText)
      setTimeout(() => {
        txtarea.focus()
        txtarea.selectionStart = txtarea.selectionEnd = startPos + tag.length
      }, 10)
    } else {
      setFormContent(prev => prev + ' ' + tag)
    }
  }

  // Handler para sincronizar edições do Editor Visual
  const handleVisualInput = () => {
    if (visualEditorRef.current) {
      const currentHtml = visualEditorRef.current.innerHTML
      lastFormContentRef.current = currentHtml
      setFormContent(currentHtml)
    }
  }

  // Preservação de seleção para seletores de cor (evita perda de foco)
  const savedSelectionRef = useRef<Range | null>(null)

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    if (savedSelectionRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedSelectionRef.current)
      }
    }
  }

  const execCmdWithSelection = (cmd: string, val: string = '', targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (targetRef.current) {
      targetRef.current.focus()
      restoreSelection()
      document.execCommand(cmd, false, val)
      if (visualEditorRef.current) handleVisualInput()
      if (fullscreenVisualRef.current) handleFullscreenVisualInput()
    }
  }

  // Alterar a cor de fundo do Bloco / Card ativo
  const changeBlockBgColor = (colorHex: string, targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (!targetRef.current) return
    targetRef.current.focus()
    restoreSelection()
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.getRangeAt(0).commonAncestorContainer
      while (node && node !== targetRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && ['DIV', 'TABLE', 'SECTION', 'TD'].includes((node as HTMLElement).tagName)) {
          (node as HTMLElement).style.backgroundColor = colorHex
          if (visualEditorRef.current) handleVisualInput()
          if (fullscreenVisualRef.current) handleFullscreenVisualInput()
          return
        }
        node = node.parentNode
      }
    }
  }

  // Executar comando de formatação WYSIWYG
  const execCmd = (cmd: string, val: string = '') => {
    if (visualEditorRef.current) {
      visualEditorRef.current.focus()
      document.execCommand(cmd, false, val)
      handleVisualInput()
    }
  }

  // Inserir blocos de layout diretamente no Editor Visual ou Código
  const insertVisualBlock = (htmlBlock: string) => {
    if (editorTab === 'visual' && visualEditorRef.current) {
      visualEditorRef.current.focus()
      document.execCommand('insertHTML', false, htmlBlock)
      handleVisualInput()
    } else {
      setFormContent(prev => prev + '\n' + htmlBlock)
    }
  }

  // Função para deletar o bloco/card ativo focado pelo cursor
  const deleteActiveBlock = (targetRef: React.RefObject<HTMLDivElement | null>) => {
    if (!targetRef.current) return
    targetRef.current.focus()
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      let node: Node | null = selection.getRangeAt(0).commonAncestorContainer
      while (node && node !== targetRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && ['DIV', 'P', 'TABLE', 'UL', 'OL', 'H1', 'H2', 'H3', 'HR', 'SECTION'].includes((node as HTMLElement).tagName)) {
          (node as HTMLElement).remove()
          if (visualEditorRef.current) handleVisualInput()
          if (fullscreenVisualRef.current) handleFullscreenVisualInput()
          return
        }
        node = node.parentNode
      }
    }
    document.execCommand('delete', false)
    if (visualEditorRef.current) handleVisualInput()
    if (fullscreenVisualRef.current) handleFullscreenVisualInput()
  }

  // Handlers para o Editor Visual em Tela Cheia (Modal Fullscreen)
  const handleFullscreenVisualInput = () => {
    if (fullscreenVisualRef.current) {
      const currentHtml = fullscreenVisualRef.current.innerHTML
      lastFormContentRef.current = currentHtml
      setFormContent(currentHtml)
    }
  }

  const execFullscreenCmd = (cmd: string, val: string = '') => {
    if (fullscreenVisualRef.current) {
      fullscreenVisualRef.current.focus()
      document.execCommand(cmd, false, val)
      handleFullscreenVisualInput()
    }
  }

  const insertFullscreenVisualBlock = (htmlBlock: string) => {
    if (fullscreenVisualRef.current) {
      fullscreenVisualRef.current.focus()
      document.execCommand('insertHTML', false, htmlBlock)
      handleFullscreenVisualInput()
    } else {
      setFormContent(prev => prev + '\n' + htmlBlock)
    }
  }

  // Open Create Form
  const handleOpenCreate = () => {
    setEditingTemplate(null)
    setFormName('')
    setFormCategory('E-mail Marketing')
    setFormSubcategory('marketing')
    setFormContent('')
    setFormImageUrl('')
    setAiPrompt('')
    setPreviewHtml('')
    setIsEditorMaximized(false)
    setIsEditingActive(false)
    setIsEditorOpen(true)
  }

  // Open Edit Form
  const handleOpenEdit = (t: Template) => {
    setEditingTemplate(t)
    setFormName(t.nome)
    setFormCategory(t.categoria)
    setFormSubcategory(t.subcategoria || 'marketing')
    setFormContent(t.conteudo)
    setFormImageUrl(t.imagem_url || '')
    setAiPrompt('')
    setPreviewHtml('')
    setIsEditorMaximized(false)
    setIsEditingActive(false)
    setIsEditorOpen(true)
  }

  // Gerar Template com IA baseado no Prompt do usuário
  const handleGenerateAITemplate = async () => {
    if (!aiPrompt.trim()) {
      alert('Digite o que você deseja para a IA gerar no campo de Prompt (ex: Promoção de 15% de desconto em sementes com botão WhatsApp)...');
      return;
    }
    setIsGeneratingAI(true);
    try {
      const res = await api.post('/templates/gerar-ia', {
        prompt: aiPrompt,
        categoria: formCategory,
        subcategoria: formSubcategory,
        imagem_url: formImageUrl,
        usar_layout_padrao: useDefaultLayout
      });
      if (res.data?.conteudo) {
        setFormContent(res.data.conteudo);
        if (res.data.nome) {
          setFormName(res.data.nome);
        }
        // Force instant preview update with newly generated content
        let content = res.data.conteudo;
        const mockVars: Record<string, string> = {
          nome_cliente: 'Nexos Indústria LTDA',
          cpf_cnpj: '12.345.678/0001-90',
          numero_documento: 'DOC-998877',
          valor_total: 'R$ 4.850,00',
          data_vencimento: '30/08/2026',
          dias_atraso: '0',
          link_pagamento: 'https://transporte.coliseusistemas.com.br/fatura/simulado-preview',
          data_atual: new Date().toLocaleDateString('pt-BR'),
          nome_vendedor: 'Suporte Coliseu'
        };
        for (const [key, val] of Object.entries(mockVars)) {
          const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
          content = content.replace(regex, val);
        }
        setPreviewHtml(content);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao gerar modelo de e-mail marketing com IA.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Função central para atualizar e substituir a logo no modelo HTML
  const updateLogoInTemplate = (logoUrl: string) => {
    setFormImageUrl(logoUrl);
    setFormContent((prev) => {
      if (!prev) return prev;
      let updated = prev;

      // 1. Substitui somente tags <img> cujo alt ou src mencione explicitamente logo, coliseu, marca ou cabeçalho
      let replaced = false;
      updated = updated.replace(/<img([^>]*)src=["']([^"']*)["']([^>]*)>/gi, (match, before, srcVal, after) => {
        const isLogoTarget = /logo|coliseu|empresa|marca|header|topo/i.test(match) ||
                             /(?:^|\/)logo\./i.test(srcVal) ||
                             /cid:logo/i.test(srcVal);
        if (isLogoTarget && !replaced) {
          replaced = true;
          return `<img${before}src="${logoUrl}"${after}>`;
        }
        return match;
      });

      // 2. Se nenhuma foi substituída e tiver tag com alt contendo Logo ou Coliseu
      if (!replaced && /<img[^>]*alt=["'][^"']*(?:Coliseu|Logo)[^"']*["'][^>]*>/i.test(updated)) {
        updated = updated.replace(/(<img[^>]*alt=["'][^"']*(?:Coliseu|Logo)[^"']*["'][^>]*src=["'])[^"']*(["'][^>]*>)/i, `$1${logoUrl}$2`);
      }

      lastFormContentRef.current = updated;
      if (visualEditorRef.current) visualEditorRef.current.innerHTML = updated;
      if (fullscreenVisualRef.current) fullscreenVisualRef.current.innerHTML = updated;
      setPreviewHtml(updated);
      return updated;
    });

    setHtmlImportFeedback('✅ Logo anexada e sincronizada no layout do template!');
    setTimeout(() => setHtmlImportFeedback(null), 4000);
  };

  // Importador de HTML Pronto com Auto-Correção de Logo
  const applyImportedHtml = (htmlContent: string, fallbackName?: string) => {
    if (!htmlContent || !htmlContent.trim()) {
      alert('O conteúdo HTML está vazio.');
      return;
    }

    let cleanHtml = htmlContent.trim();

    // Logo oficial padrão da Coliseu Transporte para substituição de caminhos locais quebrados
    const officialLogo = formImageUrl || 'https://transporte.coliseusistemas.com.br/logobranco.jpg';

    // 1. Auto-corrige somente caminhos de LOGO locais/relativos (NÃO substituir todas as imagens de images/)
    cleanHtml = cleanHtml.replace(/<img([^>]*)src=["']((?:images\/|\.\/)?logo[^"']*)["']([^>]*)>/gi, (_m, before, _srcPath, after) => {
      return `<img${before}src="${officialLogo}"${after}>`;
    });
    // CID de logo
    cleanHtml = cleanHtml.replace(/<img([^>]*)src=["']cid:logo[^"']*["']([^>]*)>/gi, (_m, before, after) => {
      return `<img${before}src="${officialLogo}"${after}>`;
    });

    // 2. Corrige tags com alt contendo Coliseu ou Logo cuja src não seja HTTP/DataURL
    cleanHtml = cleanHtml.replace(/(<img[^>]*alt=["'][^"']*(Coliseu|Logo)[^"']*["'][^>]*src=["'])(?!https?:\/\/|data:)[^"']*(['"][^>]*>)/gi, `$1${officialLogo}$3`);
    cleanHtml = cleanHtml.replace(/(<img[^>]*src=["'])(?!https?:\/\/|data:)[^"']*(['"][^>]*alt=["'][^"']*(Coliseu|Logo)[^"']*["'][^>]*>)/gi, `$1${officialLogo}$2`);

    // 2.5 Corrige tags de ilustração de cobrança / alerta ("Documento, relógio e alerta em vermelho")
    const cobrancaAlertaUrl = '/assets/cobranca_alerta.png';
    cleanHtml = cleanHtml.replace(/<img([^>]*?)alt=["'][^"']*(?:Documento|rel[oó]gio|alerta em vermelho)[^"']*["']([^>]*?)src=["'][^"']*["']([^>]*?)>/gi, (_m, p1, p2, p3) => {
      return `<img${p1}alt="Documento, relógio e alerta em vermelho"${p2}src="${cobrancaAlertaUrl}" style="width:110px;max-width:110px;height:auto;"${p3}>`;
    });
    cleanHtml = cleanHtml.replace(/<img([^>]*?)src=["'][^"']*["']([^>]*?)alt=["'][^"']*(?:Documento|rel[oó]gio|alerta em vermelho)[^"']*["']([^>]*?)>/gi, (_m, p1, p2, p3) => {
      return `<img${p1}src="${cobrancaAlertaUrl}" style="width:110px;max-width:110px;height:auto;"${p2}alt="Documento, relógio e alerta em vermelho"${p3}>`;
    });

    // 3. Imagens com caminhos relativos (images/xxx.png, ./xxx.png) → placeholder SVG inline
    // Caminhos locais não resolvem no navegador e ficam como ícones quebrados
    cleanHtml = cleanHtml.replace(/<img([^>]*)src=["'](?!https?:\/\/|data:image\/|cid:)([^"']+)["']([^>]*)>/gi, (_m, before, srcPath, after) => {
      const altMatch = (before + after).match(/alt=["']([^"']*?)["']/i);
      const altText = altMatch ? altMatch[1] : srcPath.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
      const label = altText.length > 30 ? altText.substring(0, 27) + '...' : altText;
      const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/><text x="70" y="28" font-family="Arial" font-size="9" fill="#64748b" text-anchor="middle">📷 Imagem Local</text><text x="70" y="44" font-family="Arial" font-size="7" fill="#94a3b8" text-anchor="middle">' + label + '</text></svg>')}`;
      return `<img${before}src="${svg}" title="Imagem original: ${srcPath}"${after}>`;
    });

    setFormContent(cleanHtml);
    setImportedHtmlCode(cleanHtml);
    lastFormContentRef.current = cleanHtml;

    if (visualEditorRef.current) {
      visualEditorRef.current.innerHTML = cleanHtml;
    }
    if (fullscreenVisualRef.current) {
      fullscreenVisualRef.current.innerHTML = cleanHtml;
    }

    // Tenta extrair título automático caso nome esteja em branco
    if (!formName.trim()) {
      const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i) || cleanHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch && titleMatch[1]) {
        setFormName(titleMatch[1].trim());
      } else if (fallbackName) {
        setFormName(fallbackName);
      }
    }

    setPreviewHtml(cleanHtml);
    setHtmlImportFeedback('✅ HTML importado e logo sincronizada com sucesso!');
    setTimeout(() => setHtmlImportFeedback(null), 4000);
  };

  const handleImportHtmlFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawHtml = (event.target?.result as string) || '';
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      applyImportedHtml(rawHtml, baseName);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteClipboardHtml = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setImportedHtmlCode(text);
          applyImportedHtml(text);
          return;
        }
      }
      alert('Nenhum texto encontrado na área de transferência. Você também pode colar diretamente na caixa abaixo.');
    } catch {
      alert('Permissão de acesso à área de transferência não concedida. Cole o código manualmente na caixa abaixo.');
    }
  };

  // Enviar E-mail Teste
  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Por favor, informe um endereço de e-mail de destino válido.');
      return;
    }
    setIsSendingTest(true);
    try {
      const res = await api.post('/templates/enviar-teste', {
        destinatario: testEmail,
        assunto: formName || 'E-mail de Teste - Coliseu Transporte Templates',
        conteudo: formContent,
        imagem_url: formImageUrl,
        usar_layout_padrao: useDefaultLayout
      });
      alert(res.data?.message || `E-mail de teste enviado com sucesso para ${testEmail}!`);
      setIsTestModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao disparar e-mail de teste.');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Save Template
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName || !formCategory) {
      alert('Por favor, preencha o nome e a categoria.')
      return
    }

    const payload = {
      nome: formName,
      categoria: formCategory,
      subcategoria: formCategory === 'Mensagem WhatsApp' ? formSubcategory : null,
      conteudo: formContent,
      imagem_url: formImageUrl || null
    }

    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, payload)
      } else {
        await api.post('/templates', payload)
      }
      refetchTemplates()
      setIsEditorOpen(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar template.')
    }
  }

  // Formatting helpers
  const insertFormatting = (format: 'bold' | 'italic') => {
    const txtarea = textareaRef.current
    if (!txtarea) return

    const startPos = txtarea.selectionStart
    const endPos = txtarea.selectionEnd
    const currentText = formContent
    const selectedText = currentText.substring(startPos, endPos)

    let replacement = ''
    let cursorOffset = 0

    if (format === 'bold') {
      replacement = `*${selectedText || 'texto'}*`
      cursorOffset = selectedText ? replacement.length : 1
    } else {
      replacement = `_${selectedText || 'texto'}_`
      cursorOffset = selectedText ? replacement.length : 1
    }

    const updatedText = currentText.substring(0, startPos) + replacement + currentText.substring(endPos)
    setFormContent(updatedText)

    setTimeout(() => {
      txtarea.focus()
      if (selectedText) {
        txtarea.selectionStart = startPos
        txtarea.selectionEnd = startPos + replacement.length
      } else {
        txtarea.selectionStart = txtarea.selectionEnd = startPos + cursorOffset
      }
    }, 10)
  }

  const handleInsertEmoji = (emoji: string) => {
    const txtarea = textareaRef.current
    if (!txtarea) return

    const startPos = txtarea.selectionStart
    const endPos = txtarea.selectionEnd
    const currentText = formContent
    const updatedText = currentText.substring(0, startPos) + emoji + currentText.substring(endPos)
    setFormContent(updatedText)
    setIsEmojiOpen(false)

    setTimeout(() => {
      txtarea.focus()
      txtarea.selectionStart = txtarea.selectionEnd = startPos + emoji.length
    }, 10)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limite máximo de 2.5 MB para envio direto
    const MAX_SIZE = 2.5 * 1024 * 1024

    if (file.size <= MAX_SIZE) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateLogoInTemplate(reader.result)
        }
      }
      reader.readAsDataURL(file)
      e.target.value = ''
      return
    }

    // Se for maior que 2.5 MB, realiza compressão automática no client-side
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new window.Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Redimensiona mantendo a proporção caso a imagem seja gigantesca (máx 1920px na maior dimensão)
        const maxDimension = 1920
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          alert('Erro ao processar imagem no navegador.')
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        // Tenta comprimir progressivamente reduzindo a qualidade
        let quality = 0.8
        let dataUrl = canvas.toDataURL('image/jpeg', quality)

        // Estima tamanho em bytes (string Base64 tem aproximadamente 4/3 do tamanho binário)
        while (dataUrl.length * 0.75 > MAX_SIZE && quality > 0.3) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }

        if (dataUrl.length * 0.75 > MAX_SIZE) {
          alert('A imagem é muito grande mesmo após compressão automática! Por favor, escolha um arquivo menor.')
          return
        }

        updateLogoInTemplate(dataUrl)
      }
      img.onerror = () => {
        alert('Erro ao processar o arquivo de imagem.')
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Compile Template Text (supporting Markdown, WhatsApp shortcuts, and tags)
  const compileTemplateText = (text: string, formatMode: 'whatsapp' | 'markdown' | 'text') => {
    if (!text) return ''
    
    // 1. Escaping HTML (somente se não for template de e-mail HTML)
    let formatted = text
    const isHtml = text.includes('<div') || text.includes('<p') || text.includes('<table') || text.includes('<a ') || text.includes('<img');
    if (!isHtml) {
      formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }
    
    // 2. Variable replacement (simulated live values)
    const mockVars: Record<string, string> = {
      nome_cliente: 'Nexos Indústria LTDA',
      cpf_cnpj: '12.345.678/0001-90',
      numero_documento: 'DOC-998877',
      valor_total: 'R$ 4.850,00',
      data_vencimento: '30/06/2026',
      dias_atraso: '8',
      link_pagamento: 'https://transporte.coliseusistemas.com.br/fatura/simulado-preview',
      data_atual: new Date().toLocaleDateString('pt-BR'),
      nome_vendedor: 'Geraldo Financeiro',
      data_assinatura: new Date().toLocaleDateString('pt-BR'),
      data_inicio_contrato: new Date().toLocaleDateString('pt-BR'),
      data_fim_contrato: '15/06/2027',
      data_validade_proposta: '30/06/2026',
      nome_empresa: 'Coliseu Transporte Solutions'
    }
    
    for (const [key, val] of Object.entries(mockVars)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
      formatted = formatted.replace(regex, `<span class="bg-brand-500/15 text-brand-600 px-1 py-0.5 rounded font-bold">${val}</span>`)
    }

    if (formatMode === 'whatsapp') {
      // Bold *text*
      formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      // Italic _text_
      formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>')
      // Strikethrough ~text~
      formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>')
      // Monospace ```text```
      formatted = formatted.replace(/```([^`]+)```/g, '<code class="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] text-[#4f46e5]">$1</code>')
    } else if (formatMode === 'markdown') {
      // Headings
      formatted = formatted.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold mt-2 mb-1">$1</h3>')
      formatted = formatted.replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold mt-3 mb-1.5">$1</h2>')
      formatted = formatted.replace(/^# (.*$)/gim, '<h1 class="text-base font-bold mt-4 mb-2 border-b border-divider pb-1">$1</h1>')
      
      // Bold **text** or __text__
      formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      formatted = formatted.replace(/__([^_]+)__/g, '<strong>$1</strong>')
      
      // Italic *text* or _text_
      formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>')
      
      // Monospace `text`
      formatted = formatted.replace(/`([^`]+)`/g, '<code class="font-mono bg-bg-secondary px-1 py-0.5 rounded text-[10px]">$1</code>')
    }

    // New lines
    formatted = formatted.replace(/\n/g, '<br />')
    
    return formatted
  }

  // Delete Template
  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente excluir este template de documento?')) return
    try {
      await api.delete(`/templates/${id}`)
      refetchTemplates()
    } catch (err) {
      console.error(err)
      alert('Erro ao excluir template.')
    }
  }

  // Trigger preview rendering using memory formContent
  const handleGeneratePreview = async () => {
    setIsPreviewLoading(true)
    try {
      let content = formContent
      const mockVars: Record<string, string> = {
        nome_cliente: 'Nexos Indústria LTDA',
        cpf_cnpj: '12.345.678/0001-90',
        numero_documento: 'DOC-998877',
        valor_total: 'R$ 4.850,00',
        data_vencimento: '30/08/2026',
        dias_atraso: '0',
        link_pagamento: 'https://transporte.coliseusistemas.com.br/fatura/simulado-preview',
        data_atual: new Date().toLocaleDateString('pt-BR'),
        nome_vendedor: 'Suporte Coliseu'
      }
      for (const [key, val] of Object.entries(mockVars)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi')
        content = content.replace(regex, val)
      }
      setPreviewHtml(content)
    } catch (err) {
      console.error(err)
      setPreviewHtml('<p class="text-danger">Erro ao compilar variáveis dinâmicas.</p>')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  // Simulate PDF download
  const handleDownloadPDF = async (templateId: number) => {
    try {
      const res = await api.post(`/templates/${templateId}/pdf`)
      if (res.data.success) {
        alert(`Simulação de download do PDF: ${res.data.pdfName}\nURL: ${res.data.pdfUrl}`)
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar PDF.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Acervos de Templates</h2>
          <p className="text-xs text-text-secondary">Edite e gerencie contratos padrão, e-mails de régua e mensagens para o WhatsApp</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-primary py-2 text-xs flex items-center gap-1.5 rounded-sm"
        >
          <Plus size={14} /> Novo Template
        </button>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categories Sidebar Filter */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-4 bg-bg-primary border border-divider rounded-sm space-y-3">
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block">Categorias</span>
            
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCategory('todos')}
                className={`w-full text-left py-2 px-3 text-xs font-semibold rounded-sm transition-all flex justify-between items-center ${
                  selectedCategory === 'todos'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-text-secondary hover:bg-bg-secondary/50'
                }`}
              >
                <span>Todos os Templates</span>
                <span className="text-[10px] font-bold">{templates.length}</span>
              </button>
              
              {categories.map(cat => {
                const count = templates.filter(t => t.categoria === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left py-2 px-3 text-xs font-semibold rounded-sm transition-all flex justify-between items-center ${
                      selectedCategory === cat
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-text-secondary hover:bg-bg-secondary/50'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] font-bold">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="card p-4 bg-bg-primary border border-divider rounded-sm text-xs space-y-2">
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block">Ajuda com Variáveis</span>
            <div className="flex gap-2 text-[10px] text-text-secondary leading-relaxed">
              <Info size={16} className="text-brand-500 shrink-0 mt-0.5" />
              <p>Insira tags como <code className="bg-bg-secondary px-1 text-brand-600 font-mono font-bold">{"{{nome_cliente}}"}</code> no corpo do texto para que o motor substitua com dados reais no faturamento ou régua.</p>
            </div>
          </div>
        </div>

        {/* Listing Grid */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search bar */}
          <div className="card !p-3 bg-bg-primary border border-divider rounded-sm flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted pointer-events-none">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="input !py-1.5 !pl-9 text-xs"
                placeholder="Pesquisar por nome ou conteúdo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Templates list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTemplates.length === 0 ? (
              <div className="col-span-2 card p-12 text-center text-xs text-text-muted">
                Nenhum template encontrado nesta categoria.
              </div>
            ) : (
              filteredTemplates.map(t => (
                <div key={t.id} className="card !p-4 border border-divider hover:border-border rounded-sm flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="flex gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${
                          t.categoria === 'Contrato' ? 'bg-amber-100 text-amber-800' :
                          t.categoria === 'Mensagem WhatsApp' ? 'bg-emerald-100 text-emerald-800' :
                          t.categoria === 'E-mail de Cobrança' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {t.categoria}
                        </span>
                        {t.categoria === 'Mensagem WhatsApp' && t.subcategoria && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-brand-500/10 text-brand-600 uppercase">
                            {t.subcategoria === 'marketing' ? 'Marketing' : t.subcategoria === 'cobranca' ? 'Cobrança' : 'Pós-Venda'}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="p-1 text-text-secondary hover:text-brand-500 rounded-sm hover:bg-bg-secondary"
                          title="Editar"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-1 text-text-secondary hover:text-danger rounded-sm hover:bg-bg-secondary"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    
                    <h4 className="font-bold text-text-primary text-xs mt-2.5">{t.nome}</h4>
                    <p className="text-[10px] text-text-secondary mt-1.5 line-clamp-3 bg-bg-secondary/20 p-2 border border-divider/60 rounded-sm whitespace-pre-wrap">
                      {t.conteudo || 'Sem conteúdo.'}
                    </p>
                  </div>

                  <div className="border-t border-divider/60 pt-2 flex justify-between items-center text-[9px] text-text-muted">
                    <span>Atualizado em {new Date(t.updated_at).toLocaleDateString('pt-BR')}</span>
                    {t.categoria === 'Contrato' && (
                      <button
                        onClick={() => handleDownloadPDF(t.id)}
                        className="text-brand-500 hover:underline flex items-center gap-0.5 font-semibold"
                      >
                        <Download size={10} /> Testar PDF
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* DETAILED EDITOR MODAL (Side-by-side: Editor + dynamic side bar) */}
      {isEditorOpen && (
        <div className={`fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center backdrop-blur-sm ${isEditorMaximized ? 'p-0' : 'p-2 sm:p-4'}`}>
          <div className={`card w-full p-0 bg-bg-primary animate-scale-up rounded-sm flex flex-col overflow-hidden border border-divider transition-all duration-300 ${
            isEditorMaximized ? 'max-w-none h-full rounded-none border-0' : 'max-w-6xl h-[92vh]'
          }`}>
            {/* Modal Header */}
            <div className="p-3.5 border-b border-divider bg-bg-secondary flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-text-primary text-sm">
                  {editingTemplate ? `Editar Template: ${formName}` : 'Criar Novo Template'}
                </h3>
                <span className="text-[10px] bg-brand-500/10 text-brand-500 font-bold px-2 py-0.5 rounded">
                  {editorTab === 'visual' ? '👁️ Editor Visual (WYSIWYG)' : '💻 Código HTML'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorMaximized(!isEditorMaximized)}
                  className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded flex items-center gap-1.5 font-bold border border-divider transition-all cursor-pointer shadow-2xs"
                  title={isEditorMaximized ? "Restaurar tamanho normal" : "Expandir Editor em Tela Cheia"}
                >
                  {isEditorMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span className="hidden sm:inline">{isEditorMaximized ? "Restaurar Tela" : "⛶ Tela Cheia"}</span>
                </button>

                <button
                  className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded-sm cursor-pointer"
                  onClick={() => setIsEditorOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body (split into Editor vs Tags vs Preview) */}
            <div className="flex-1 flex overflow-hidden divide-x divide-divider">
              
              {/* Left Column: Form & Content Area */}
              <form onSubmit={handleSave} className="w-1/2 p-4 flex flex-col justify-between gap-4 overflow-y-auto bg-bg-primary">
                <div className="space-y-3.5 text-xs">
                  <div className={`grid ${formCategory === 'Mensagem WhatsApp' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Nome do Documento *</label>
                      <input
                        type="text"
                        className="input !py-2 rounded-sm border border-divider focus:border-brand-500 bg-bg-primary text-text-primary"
                        required
                        placeholder="Ex: E-mail Marketing Promoção de Inverno"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Categoria</label>
                      <select
                        className="input !py-2 rounded-sm border border-divider focus:border-brand-500 bg-bg-primary text-text-primary font-bold"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                      >
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>

                    {formCategory === 'Mensagem WhatsApp' && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Subcategoria (Uso)</label>
                        <select
                          className="input !py-2 rounded-sm border border-divider focus:border-brand-500 bg-bg-primary text-text-primary font-bold"
                          value={formSubcategory}
                          onChange={(e) => setFormSubcategory(e.target.value)}
                        >
                          <option value="marketing">Marketing</option>
                          <option value="cobranca">Cobrança</option>
                          <option value="pos_venda">Pós-Venda</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* SELETOR DE MODO DE CRIAÇÃO DO MODELO: IA vs IMPORTAR HTML PRONTO */}
                  <div className="flex items-center gap-1.5 p-1 bg-bg-secondary/60 rounded-md border border-divider">
                    <button
                      type="button"
                      onClick={() => setCreationMode('ai')}
                      className={`flex-1 py-1.5 px-3 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        creationMode === 'ai'
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      <Sparkles size={13} className={creationMode === 'ai' ? 'animate-pulse' : ''} />
                      <span>✨ Criar com IA (Prompt & Anexo)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreationMode('import_html')}
                      className={`flex-1 py-1.5 px-3 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        creationMode === 'import_html'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      <FileCode size={13} />
                      <span>📥 Importar HTML Pronto (.html / Código)</span>
                    </button>
                  </div>

                  {/* Inputs ocultos para upload de arquivos */}
                  <input
                    type="file"
                    ref={htmlFileInputRef}
                    onChange={handleImportHtmlFile}
                    accept=".html,.htm,text/html"
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    className="hidden"
                  />

                  {creationMode === 'ai' ? (
                    /* MODO 1: Gerador de Template com IA / Prompt */
                    <div className="p-3.5 bg-gradient-to-r from-indigo-50/95 via-purple-50/95 to-blue-50/95 dark:from-indigo-950/50 dark:via-purple-950/50 dark:to-blue-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-md space-y-2.5 shadow-sm animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-extrabold text-[11px] uppercase tracking-wider">
                          <Sparkles size={15} className="text-indigo-500 animate-pulse" />
                          Criar Modelo com IA (Prompt & Anexo)
                        </div>
                        <span className="text-[8.5px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                          Inteligência Coliseu Transporte
                        </span>
                      </div>

                      <p className="text-[10px] text-text-secondary leading-normal">
                        Descreva em detalhes o que a IA deve gerar para sua campanha ou comunicado oficial (suporta prompt extenso):
                      </p>

                      <textarea
                        className="input w-full p-2.5 text-xs font-sans border-indigo-200 dark:border-indigo-800 focus:border-indigo-500 bg-bg-primary text-text-primary rounded-sm leading-relaxed min-h-[95px] resize-y"
                        rows={4}
                        placeholder="Ex: Crie uma página web (comunicado oficial) para a empresa Coliseu Sistemas sobre a Reforma Tributária com tabela de alíquotas CBS/IBS 1%, caixas de aviso em verde e amarelo e botões de contato..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-secondary !py-1.5 px-3 text-[11px] font-semibold flex items-center gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-slate-900/80 hover:bg-white rounded-sm cursor-pointer shadow-2xs"
                          >
                            <Paperclip size={13} />
                            {formImageUrl ? 'Alterar Logo/Foto Anexada' : '📷 Anexar Logo / Foto para a IA'}
                          </button>
                          {formImageUrl && (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200">
                              <Check size={12} /> Logo Anexada
                            </span>
                          )}

                          <label className="flex items-center gap-1.5 text-xs text-indigo-900 dark:text-indigo-200 font-bold cursor-pointer select-none bg-indigo-50/80 dark:bg-indigo-950/40 px-2.5 py-1 rounded border border-indigo-200/80 hover:bg-indigo-100/80 transition-all">
                            <input
                              type="checkbox"
                              checked={useDefaultLayout}
                              onChange={(e) => setUseDefaultLayout(e.target.checked)}
                              className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            🖼️ Usar Layout Padrão (Artes de Topo e Rodapé)
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateAITemplate}
                          disabled={isGeneratingAI}
                          className="btn-primary !py-1.5 px-4 text-xs flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold rounded-sm shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          {isGeneratingAI ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Gerando Modelo...
                            </>
                          ) : (
                            <>
                              <Wand2 size={13} />
                              ✨ Gerar Modelo com IA
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* MODO 2: Importador de HTML Pronto para E-mail Marketing */
                    <div className="p-3.5 bg-gradient-to-r from-emerald-50/95 via-teal-50/95 to-cyan-50/95 dark:from-emerald-950/50 dark:via-teal-950/50 dark:to-cyan-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-md space-y-2.5 shadow-sm animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-extrabold text-[11px] uppercase tracking-wider">
                          <FileCode size={15} className="text-emerald-600 dark:text-emerald-400" />
                          Importar HTML Pronto de E-mail Marketing
                        </div>
                        <span className="text-[8.5px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                          Upload & Código
                        </span>
                      </div>

                      <p className="text-[10px] text-text-secondary leading-normal">
                        Carregue um arquivo <strong className="text-emerald-700 dark:text-emerald-300">.html</strong> pronto ou cole o código HTML. O sistema detecta e corrige a logo da empresa automaticamente:
                      </p>

                      {/* Botões de Ação de Importação */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => htmlFileInputRef.current?.click()}
                          className="btn-secondary !py-1.5 px-3 text-[11px] font-bold flex items-center gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 bg-white/90 dark:bg-slate-900/90 hover:bg-white rounded-sm cursor-pointer shadow-2xs"
                        >
                          <FolderOpen size={13} className="text-emerald-600" />
                          📂 Escolher Arquivo HTML (.html / .htm)
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn-secondary !py-1.5 px-3 text-[11px] font-bold flex items-center gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-white/90 dark:bg-slate-900/90 hover:bg-white rounded-sm cursor-pointer shadow-2xs"
                          title="Anexar ou alterar a logo/imagem do cabeçalho do template"
                        >
                          <Paperclip size={13} className="text-indigo-600" />
                          {formImageUrl ? '📷 Alterar Logo Anexada' : '📷 Anexar Logo Personalizada'}
                        </button>

                        <button
                          type="button"
                          onClick={handlePasteClipboardHtml}
                          className="btn-secondary !py-1.5 px-3 text-[11px] font-bold flex items-center gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 bg-white/90 dark:bg-slate-900/90 hover:bg-white rounded-sm cursor-pointer shadow-2xs"
                        >
                          <Clipboard size={13} className="text-emerald-600" />
                          📋 Colar da Área de Transferência
                        </button>
                      </div>

                      {/* Textarea para Colar/Editar o Código HTML */}
                      <div className="space-y-1">
                        <textarea
                          className="input w-full p-2.5 text-[11px] font-mono border-emerald-200 dark:border-emerald-800 focus:border-emerald-500 bg-bg-primary text-text-primary rounded-sm leading-relaxed min-h-[110px] resize-y"
                          rows={5}
                          placeholder="Cole aqui o código HTML completo do seu E-mail Marketing (ex: <table>, <div>, <img>, estilos CSS inline, botões, etc.)..."
                          value={importedHtmlCode}
                          onChange={(e) => setImportedHtmlCode(e.target.value)}
                        />
                      </div>

                      {/* Rodapé da Importação: Feedback e Botão Aplicar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-2">
                          {htmlImportFeedback && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-extrabold flex items-center gap-1 bg-emerald-100/80 dark:bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-300 animate-in fade-in duration-150">
                              <CheckCircle2 size={13} className="text-emerald-600" />
                              {htmlImportFeedback}
                            </span>
                          )}
                          {!htmlImportFeedback && importedHtmlCode && (
                            <span className="text-[9.5px] text-text-secondary font-mono">
                              {importedHtmlCode.length.toLocaleString('pt-BR')} caracteres prontos
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => applyImportedHtml(importedHtmlCode)}
                          disabled={!importedHtmlCode || !importedHtmlCode.trim()}
                          className="btn-primary !py-1.5 px-4 text-xs flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-sm shadow-sm disabled:opacity-40 cursor-pointer"
                        >
                          <Upload size={13} />
                          🚀 Carregar HTML no Modelo
                        </button>
                      </div>
                    </div>
                  )}

                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-divider mt-auto">
                    <button
                      type="button"
                      onClick={() => setIsTestModalOpen(true)}
                      className="btn-secondary rounded-sm text-xs flex items-center gap-1.5 border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 font-bold cursor-pointer"
                    >
                      <Send size={13} /> Enviar E-mail Teste
                    </button>
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary rounded-sm" onClick={() => setIsEditorOpen(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn-primary rounded-sm">
                        Salvar Template
                      </button>
                    </div>
                  </div>
              </form>

              {/* Right Column: Clean Live Preview & Fullscreen Editor Trigger */}
              <div className="w-1/2 flex flex-col overflow-hidden divide-y divide-divider bg-bg-secondary/20 p-4 space-y-3">
                
                {/* Header: Live Preview Title & Fullscreen Editor Button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-extrabold text-text-primary uppercase tracking-wider">
                      👁️ Pré-Visualização do Layout em Tempo Real
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullscreenPreviewOpen(true)}
                    className="px-3.5 py-1.5 text-xs text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-md flex items-center gap-1.5 font-extrabold shadow-md cursor-pointer animate-pulse transition-all"
                    title="Abrir Editor Visual em Tela Cheia"
                  >
                    <Maximize2 size={14} />
                    <span>⛶ Editar Layout em Tela Cheia</span>
                  </button>
                </div>

                {/* Live rendering compiler preview or WhatsApp Mobile Chat Simulator */}
                {formCategory === 'Mensagem WhatsApp' ? (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Simulador WhatsApp (Tempo Real)</span>
                    
                    <div className="flex-1 flex items-center justify-center p-2 bg-bg-primary border border-divider rounded-sm overflow-hidden">
                      {/* Phone Container */}
                      <div className="w-full max-w-[320px] h-[350px] bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg shadow-lg flex flex-col overflow-hidden">
                        {/* WhatsApp Header */}
                        <div className="bg-[#075e54] dark:bg-[#1f2c34] text-white p-2 flex items-center gap-2 shadow-sm shrink-0">
                          <div className="bg-white/10 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] border border-white/20 uppercase">
                            C
                          </div>
                          <div className="flex-1 flex flex-col">
                            <span className="font-bold text-[11px] leading-tight">Coliseu Transporte Suporte</span>
                            <span className="text-[8px] text-emerald-300 opacity-90 leading-none">online</span>
                          </div>
                        </div>

                        {/* WhatsApp Chat Body */}
                        <div className="flex-1 p-3 bg-[#efeae2] dark:bg-[#0b141a] overflow-y-auto space-y-2 flex flex-col justify-end">
                          <div className="bg-white dark:bg-[#005c4b] text-slate-900 dark:text-slate-100 p-2.5 rounded-lg rounded-tl-none text-xs shadow-xs border border-slate-200 dark:border-none leading-relaxed max-w-[90%] font-sans whitespace-pre-wrap">
                            {formContent ? (
                              <div dangerouslySetInnerHTML={{ __html: compileTemplateText(formContent, 'markdown') }} />
                            ) : (
                              <span className="text-slate-400 italic">Digite o conteúdo da mensagem...</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-2">
                    <div className="flex justify-between items-center bg-bg-primary p-2 border border-divider rounded-sm">
                      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                        ✨ Layout Compilado (Modo Leitura)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsFullscreenPreviewOpen(true)}
                        className="text-[11px] text-brand-600 dark:text-brand-400 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Maximize2 size={12} /> Clique aqui para Editar Visualmente em Tela Cheia ⛶
                      </button>
                    </div>

                    <div
                      onClick={() => setIsFullscreenPreviewOpen(true)}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-md p-5 overflow-y-auto shadow-inner text-slate-900 dark:text-slate-100 font-sans leading-relaxed cursor-pointer hover:border-brand-500 transition-all group relative"
                    >
                      <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded shadow group-hover:scale-105 transition-all">
                        ⛶ Clique para Editar em Tela Cheia
                      </div>
                      {formContent ? (
                        <div dangerouslySetInnerHTML={{ __html: formContent }} />
                      ) : (
                        <div className="h-full flex flex-col justify-center items-center gap-2 text-slate-400 py-10">
                          <FileText size={32} className="opacity-40" />
                          <span className="font-bold text-xs">Seu template está vazio.</span>
                          <span className="text-[11px]">Digite as instruções à esquerda e clique em ✨ Gerar Modelo com IA</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Live rendering compiler preview or WhatsApp Mobile Chat Simulator */}
                {formCategory === 'Mensagem WhatsApp' ? (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Simulador WhatsApp (Tempo Real)</span>
                    
                    <div className="flex-1 flex items-center justify-center p-2 bg-bg-primary border border-divider rounded-sm overflow-hidden">
                      {/* Phone Container */}
                      <div className="w-full max-w-[320px] h-[350px] bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg shadow-lg flex flex-col overflow-hidden">
                        {/* WhatsApp Header */}
                        <div className="bg-[#075e54] dark:bg-[#1f2c34] text-white p-2 flex items-center gap-2 shadow-sm shrink-0">
                          <div className="bg-white/10 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] border border-white/20 uppercase">
                            C
                          </div>
                          <div className="flex-1 flex flex-col">
                            <span className="font-bold text-[11px] leading-tight">Coliseu Transporte Suporte</span>
                            <span className="text-[8px] text-emerald-300 opacity-90 leading-none">online</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/80">
                            {/* Simple indicator icons */}
                            <span className="text-[8px] font-bold opacity-60">WA</span>
                          </div>
                        </div>

                        {/* WhatsApp Body wallpaper */}
                        <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-2 relative bg-[#efeae2] dark:bg-[#0b141a] bg-cover bg-center">
                          {/* Chat Bubble */}
                          <div className="max-w-[85%] self-end bg-[#d9fdd3] dark:bg-[#005c4b] text-[#303030] dark:text-[#e9edef] rounded-lg rounded-tr-none p-2 shadow-sm relative flex flex-col gap-1 text-[11px] font-sans leading-relaxed border border-black/5 dark:border-white/5">
                            {/* Attached image preview inside bubble */}
                            {formImageUrl && (
                              <div className="w-full mb-1 border border-black/5 rounded-sm overflow-hidden">
                                <img
                                  src={formImageUrl}
                                  alt="Preview WhatsApp"
                                  className="w-full max-h-36 object-cover"
                                  onError={(e) => {
                                    // Fallback for broken external urls
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}

                            {/* Message text formatted */}
                            <div
                              className="break-words font-sans whitespace-pre-wrap text-[11px]"
                              dangerouslySetInnerHTML={{
                                __html: compileTemplateText(formContent || 'Digite no editor ao lado para visualizar a mensagem no simulador do WhatsApp...', 'whatsapp')
                              }}
                            />

                            {/* Bubble footer with time and double check */}
                            <div className="flex items-center justify-end gap-0.5 self-end text-[8px] text-slate-500 dark:text-slate-350 mt-1 select-none leading-none">
                              <span>
                                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-sky-400 font-bold ml-1 text-[10px]">✔✔</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : formCategory === 'E-mail de Cobrança' ? (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Simulador de E-mail (Gmail)</span>
                    
                    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary border border-divider rounded-sm shadow-sm text-xs">
                      {/* Email Client Top Bar */}
                      <div className="bg-bg-secondary p-2 border-b border-divider flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-400"></span>
                          <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                          <span className="w-2 h-2 rounded-full bg-green-400"></span>
                        </div>
                        <span className="text-[9px] text-text-secondary font-semibold">Mensagem de E-mail</span>
                        <span className="w-6"></span>
                      </div>
                      
                      {/* Email Headers */}
                      <div className="p-3 border-b border-divider space-y-1.5 bg-bg-primary shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-text-secondary font-bold min-w-[50px]">Assunto:</span>
                          <span className="text-text-primary font-semibold truncate text-[11px]">
                            {"Lembrete de Vencimento - Fatura {{numero_documento}} - {{nome_cliente}}"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted border-t border-divider/40 pt-1">
                          <span className="font-semibold text-text-secondary min-w-[50px]">De:</span>
                          <span className="text-text-primary">Coliseu Transporte Cobranças &lt;cobranca@coliseutransporte.com.br&gt;</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          <span className="font-semibold text-text-secondary min-w-[50px]">Para:</span>
                          <span className="text-text-primary">{"{{nome_cliente}} <cliente@email.com.br>"}</span>
                        </div>
                      </div>
                      
                      {/* Email Body */}
                      <div className="flex-1 p-4 overflow-y-auto bg-bg-primary text-text-primary leading-relaxed select-text min-h-0">
                        <div 
                          className="font-sans text-[11px]"
                          dangerouslySetInnerHTML={{ 
                            __html: compileTemplateText(formContent || 'Digite o corpo do e-mail ao lado...', 'markdown') 
                          }} 
                        />
                      </div>
                    </div>
                  </div>
                ) : formCategory === 'Contrato' ? (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Visualização de Contrato (Folha A4)</span>
                    
                    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary border border-divider rounded-sm shadow-sm">
                      {/* Sheet Top Bar */}
                      <div className="bg-bg-secondary px-3 py-1.5 border-b border-divider flex justify-between items-center text-[9px] text-text-secondary shrink-0">
                        <span className="font-semibold uppercase tracking-wider">Documento Simulado</span>
                        <span className="text-text-muted">Modelo A4</span>
                      </div>
                      
                      {/* A4 Sheet Body */}
                      <div className="flex-1 p-5 overflow-y-auto bg-white text-slate-800 leading-relaxed text-[10px] font-serif select-text min-h-0">
                        <div className="max-w-[420px] mx-auto w-full">
                          <h2 className="text-center font-bold text-xs uppercase tracking-wide border-b border-slate-300 pb-2 mb-4">
                            CONTRATO DE PRESTAÇÃO DE SERVIÇOS
                          </h2>
                          
                          <div 
                            className="space-y-3 text-justify leading-relaxed whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ 
                              __html: compileTemplateText(formContent || 'Digite as cláusulas do contrato ao lado...', 'markdown') 
                            }} 
                          />
                          
                          {/* Signatures block */}
                          <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-2 gap-4 text-center text-[8px] font-sans">
                            <div className="space-y-6">
                              <div className="border-b border-slate-300 mx-2"></div>
                              <span className="font-semibold uppercase text-slate-500 block">{"Contratante ({{nome_cliente}})"}</span>
                            </div>
                            <div className="space-y-6">
                              <div className="border-b border-slate-300 mx-2"></div>
                              <span className="font-semibold uppercase text-slate-500 block">Contratada (Coliseu Transporte ERP)</span>
                            </div>
                          </div>
                          
                          {/* Legal Footer warning */}
                          <div className="mt-8 text-[7px] text-slate-400 border-t border-slate-100 pt-2 font-sans italic text-center leading-normal">
                            Aviso Crítico: Este modelo de contrato é genérico e serve apenas para simulação no sistema Coliseu Transporte. Recomenda-se a revisão e adaptação por um profissional jurídico habilitado.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : formCategory === 'Proposta Comercial' ? (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider block">Visualização da Proposta Comercial</span>
                    
                    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary border border-divider rounded-sm shadow-sm">
                      {/* Page Top Bar */}
                      <div className="bg-bg-secondary px-3 py-1.5 border-b border-divider flex justify-between items-center text-[9px] text-text-secondary shrink-0">
                        <span className="font-semibold uppercase tracking-wider">Interface de CRM</span>
                        <span className="text-text-muted">Proposta</span>
                      </div>
                      
                      {/* Document Body */}
                      <div className="flex-1 p-4 overflow-y-auto bg-slate-50 dark:bg-slate-900 leading-relaxed text-[10px] font-sans select-text min-h-0">
                        <div className="max-w-[420px] mx-auto w-full space-y-3">
                          {/* Proposal Modern Cover Header */}
                          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-3.5 rounded shadow-sm flex justify-between items-start">
                            <div className="space-y-1">
                              <span className="text-[7px] uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded font-bold">Proposta Comercial</span>
                              <h2 className="font-extrabold text-xs tracking-tight leading-tight">
                                {"{{nome_empresa}}"}
                              </h2>
                              <p className="text-[8px] opacity-90">{"Preparado para: {{nome_cliente}}"}</p>
                            </div>
                            <div className="text-right text-[7px] space-y-0.5 opacity-90 font-mono">
                              <div>Nº: <span className="font-bold">{"{{numero_documento}}"}</span></div>
                              <div>Data: <span className="font-bold">{"{{data_atual}}"}</span></div>
                              <div>Validade: <span className="font-bold text-amber-300">{"{{data_validade_proposta}}"}</span></div>
                            </div>
                          </div>
                          
                          {/* Content wrapper */}
                          <div className="bg-white dark:bg-slate-800 p-4 rounded border border-divider shadow-sm text-text-primary">
                            <div 
                              className="space-y-3 leading-relaxed text-[11px]"
                              dangerouslySetInnerHTML={{ 
                                __html: compileTemplateText(formContent || 'Digite os detalhes da proposta comercial...', 'markdown') 
                              }} 
                            />
                            
                            {/* Call to action & price */}
                            <div className="mt-5 pt-3.5 border-t border-divider flex justify-between items-center bg-bg-secondary/15 p-2 rounded">
                              <div className="flex flex-col">
                                <span className="text-[7px] text-text-secondary uppercase font-bold">Investimento</span>
                                <span className="text-xs font-extrabold text-emerald-600 font-mono">{"{{valor_total}}"}</span>
                              </div>
                              <span className="bg-emerald-500 text-white px-2.5 py-1 rounded-sm font-bold text-[8px] shadow-sm uppercase tracking-wider select-none">
                                Aceitar Proposta
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 p-4 flex flex-col overflow-hidden gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Visualização Compilada (Mock)</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsFullscreenPreviewOpen(true)}
                          className="btn-secondary !py-1 text-[9px] font-bold flex items-center gap-1 bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/30 hover:bg-brand-500/20 rounded-sm cursor-pointer"
                        >
                          <Maximize2 size={12} /> Tela Cheia (Editar Visual)
                        </button>
                        <button
                          type="button"
                          onClick={handleGeneratePreview}
                          disabled={isPreviewLoading}
                          className="btn-secondary !py-1 text-[9px] font-semibold flex items-center gap-1 hover:border-brand-500 rounded-sm"
                        >
                          <Eye size={12} /> {isPreviewLoading ? 'Compilando...' : 'Atualizar'}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 bg-bg-primary border border-divider rounded-sm p-4 overflow-y-auto max-h-[300px] text-xs">
                      {previewHtml ? (
                        <div className="whitespace-pre-wrap leading-relaxed text-text-primary" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      ) : (
                        <div className="h-full flex flex-col justify-center items-center gap-2 text-text-muted">
                          <FileText size={28} className="opacity-45" />
                          <span>Clique em Atualizar para simular a interpolação das variáveis</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal de Disparo de E-mail Teste */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg-primary border border-divider rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-3.5 border-b border-divider bg-bg-secondary flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-sm text-text-primary">
                <Send size={16} className="text-brand-500" />
                Enviar E-mail de Teste
              </div>
              <button
                className="p-1 text-text-secondary hover:bg-bg-tertiary rounded-sm"
                onClick={() => setIsTestModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-text-secondary leading-relaxed">
                Insira o e-mail de destino para receber a versão de teste deste modelo formatado:
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">E-mail Destinatário *</label>
                <input
                  type="email"
                  className="input w-full !py-2 rounded border border-divider focus:border-brand-500 bg-bg-primary text-text-primary font-medium"
                  required
                  placeholder="exemplo@dominio.com.br"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendTestEmail();
                    }
                  }}
                />
              </div>

              {formImageUrl && (
                <div className="p-2.5 bg-bg-secondary/40 border border-divider rounded flex items-center gap-2 text-[11px] text-text-secondary">
                  <Check size={14} className="text-emerald-500" />
                  <span>Sua logo/imagem anexada será incluída no topo do e-mail.</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-divider bg-bg-secondary flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary text-xs rounded-sm"
                onClick={() => setIsTestModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                className="btn-primary text-xs rounded-sm flex items-center gap-1.5 font-bold cursor-pointer disabled:opacity-50"
              >
                {isSendingTest ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    Disparar Teste Agora
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização & Edição em Tela Cheia */}
      {isFullscreenPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col w-screen h-screen overflow-hidden animate-in fade-in duration-150">
          {/* Fullscreen Header Bar */}
          <div className="bg-bg-primary border-b border-divider px-6 py-3 flex flex-wrap justify-between items-center shrink-0 gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-500/15 text-brand-500 rounded-md font-bold text-xs">
                <Maximize2 size={18} />
              </div>
              <div>
                <h3 className="font-extrabold text-text-primary text-sm tracking-tight flex items-center gap-2">
                  Visualizador & Editor em Tela Cheia: <span className="text-brand-500 font-mono">{formName || 'Novo Template'}</span>
                </h3>
                <p className="text-[11px] text-text-secondary">Visualize em 100% da tela e edite o HTML ou texto diretamente sem cortes.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Toggle Visual vs Editor Code */}
              <div className="flex bg-bg-secondary p-1 rounded-md border border-divider">
                <button
                  type="button"
                  onClick={() => setFullscreenTab('visual')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-all flex items-center gap-1.5 cursor-pointer ${
                    fullscreenTab === 'visual' ? 'bg-brand-500 text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Eye size={13} /> 👁️ Edição Visual Direta no Layout (Clique e Digite)
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreenTab('code')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-all flex items-center gap-1.5 cursor-pointer ${
                    fullscreenTab === 'code' ? 'bg-brand-500 text-white shadow-xs' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Code size={13} /> 💻 Código HTML Avançado
                </button>
              </div>

              {/* Input oculto para carregar HTML em tela cheia */}
              <input
                type="file"
                ref={fullscreenHtmlFileInputRef}
                onChange={handleImportHtmlFile}
                accept=".html,.htm,text/html"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fullscreenHtmlFileInputRef.current?.click()}
                className="btn-secondary text-xs font-bold flex items-center gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 hover:bg-emerald-100 rounded-md cursor-pointer"
                title="Carregar arquivo HTML pronto (.html / .htm)"
              >
                <FolderOpen size={13} className="text-emerald-600" />
                <span>📥 Importar HTML</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary text-xs font-bold flex items-center gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 hover:bg-indigo-100 rounded-md cursor-pointer"
              >
                <Paperclip size={13} /> Anexar Logo
              </button>

              <button
                type="button"
                onClick={() => setIsTestModalOpen(true)}
                className="btn-secondary text-xs font-bold flex items-center gap-1.5 border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-md cursor-pointer"
              >
                <Send size={13} /> Enviar E-mail Teste
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreenPreviewOpen(false)}
                className="btn-primary text-xs font-bold flex items-center gap-1 rounded-md bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
              >
                <Minimize2 size={13} /> Fechar Tela Cheia
              </button>
            </div>
          </div>

          {/* Fullscreen Body */}
          <div className="flex-1 bg-slate-950 p-6 overflow-y-auto flex justify-center items-start">
            {fullscreenTab === 'visual' ? (
              <div className="w-full max-w-[1100px] bg-slate-900 rounded-xl shadow-2xl overflow-hidden my-auto border border-slate-800 flex flex-col gap-3 p-4">
                
                {/* Fullscreen Smart Tags Toolbar */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 shadow-md">
                  <span className="text-[11px] font-extrabold text-indigo-400 uppercase tracking-wider block">
                    🏷️ Inserir Tags Inteligentes (Clique para Adicionar no Editor):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {placeholders.map(p => (
                      <button
                        key={p.tag}
                        type="button"
                        onMouseDown={saveSelection}
                        onClick={() => handleInsertTag(p.tag)}
                        className="px-2.5 py-1 text-[11px] font-mono font-bold text-indigo-300 bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-700/80 rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                        title={p.label}
                      >
                        <span>{p.tag}</span>
                        <span className="text-[9px] opacity-75 font-sans">({p.label})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fullscreen Rich Formatting Toolbar */}
                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white shadow-md">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">Ferramentas de Edição:</span>
                  <button type="button" onClick={() => execFullscreenCmd('bold')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded font-bold cursor-pointer" title="Negrito"><b>B</b></button>
                  <button type="button" onClick={() => execFullscreenCmd('italic')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded italic cursor-pointer" title="Itálico"><i>I</i></button>
                  <button type="button" onClick={() => execFullscreenCmd('underline')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded underline cursor-pointer" title="Sublinhado"><u>U</u></button>
                  <button type="button" onClick={() => execFullscreenCmd('strikeThrough')} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded line-through cursor-pointer" title="Riscado"><s>S</s></button>
                  
                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />
                  
                  {/* Font Size Selector */}
                  <select onChange={(e) => execFullscreenCmd('fontSize', e.target.value)} className="text-[11px] p-1 bg-slate-900 border border-slate-700 text-white rounded font-bold cursor-pointer" title="Tamanho da Fonte">
                    <option value="2">Fonte 13px (Padrão)</option>
                    <option value="1">Fonte 10px (Pequena)</option>
                    <option value="3">Fonte 16px (Média)</option>
                    <option value="4">Fonte 18px (Grande)</option>
                    <option value="5">Fonte 24px (Título)</option>
                    <option value="6">Fonte 32px (Destaque)</option>
                    <option value="7">Fonte 48px (Gigante)</option>
                  </select>

                  {/* Font Scale Buttons A- / A+ */}
                  <button type="button" onClick={() => execFullscreenCmd('decreaseFontSize')} className="px-2 py-1 text-[11px] font-black bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Diminuir Fonte">A-</button>
                  <button type="button" onClick={() => execFullscreenCmd('increaseFontSize')} className="px-2 py-1 text-[11px] font-black bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Aumentar Fonte">A+</button>

                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                  <select onChange={(e) => execFullscreenCmd('formatBlock', e.target.value)} className="text-[11px] p-1 bg-slate-900 border border-slate-700 text-white rounded font-bold cursor-pointer">
                    <option value="p">Texto Normal (Parágrafo)</option>
                    <option value="h2">Título Principal (H2)</option>
                    <option value="h3">Subtítulo (H3)</option>
                  </select>

                  {/* Text Color Selector */}
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded select-none"
                    title="Cor do Texto Selecionado"
                    onMouseDown={saveSelection}
                    onClick={saveSelection}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-brand-500 border border-white inline-block" />
                    Cor Texto
                    <input
                      type="color"
                      onFocus={saveSelection}
                      onMouseDown={saveSelection}
                      onChange={(e) => execCmdWithSelection('foreColor', e.target.value, fullscreenVisualRef)}
                      className="w-0 h-0 opacity-0 absolute"
                    />
                  </label>

                  {/* Text Highlight Background Color Selector */}
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded select-none"
                    title="Realce de Texto (Fundo da Palavra)"
                    onMouseDown={saveSelection}
                    onClick={saveSelection}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-yellow-400 border border-white inline-block" />
                    Realce Texto
                    <input
                      type="color"
                      onFocus={saveSelection}
                      onMouseDown={saveSelection}
                      onChange={(e) => execCmdWithSelection('hiliteColor', e.target.value, fullscreenVisualRef)}
                      className="w-0 h-0 opacity-0 absolute"
                    />
                  </label>

                  {/* Block / Card Background Color Selector */}
                  <label
                    className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 px-2 py-1 rounded select-none"
                    title="Alterar Cor de Fundo do Bloco/Card Ativo"
                    onMouseDown={saveSelection}
                    onClick={saveSelection}
                  >
                    <span className="w-3.5 h-3.5 rounded bg-indigo-500 border border-white inline-block" />
                    🎨 Cor do Bloco
                    <input
                      type="color"
                      onFocus={saveSelection}
                      onMouseDown={saveSelection}
                      onChange={(e) => changeBlockBgColor(e.target.value, fullscreenVisualRef)}
                      className="w-0 h-0 opacity-0 absolute"
                    />
                  </label>

                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                  {/* Alignments */}
                  <button type="button" onClick={() => execFullscreenCmd('justifyLeft')} className="p-1 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Alinhar à Esquerda">⬅️</button>
                  <button type="button" onClick={() => execFullscreenCmd('justifyCenter')} className="p-1 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Centralizar">↔️</button>
                  <button type="button" onClick={() => execFullscreenCmd('justifyRight')} className="p-1 bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Alinhar à Direita">➡️</button>

                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                  {/* Lists & Divider */}
                  <button type="button" onClick={() => execFullscreenCmd('insertUnorderedList')} className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Inserir Tópicos">• Lista</button>
                  <button type="button" onClick={() => execFullscreenCmd('insertOrderedList')} className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Inserir Números">1. Lista</button>
                  <button type="button" onClick={() => execFullscreenCmd('insertHorizontalRule')} className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 rounded cursor-pointer" title="Linha Divisória">➖ Linha</button>

                  {/* Delete Active Block Button */}
                  <button type="button" onClick={() => deleteActiveBlock(fullscreenVisualRef)} className="px-2 py-1 text-[11px] font-black bg-rose-600 hover:bg-rose-700 text-white rounded cursor-pointer shadow-xs flex items-center gap-1" title="Deletar o Bloco/Card ativo selecionado">
                    🗑️ Deletar Bloco
                  </button>

                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />

                  <span className="text-[10px] font-extrabold uppercase text-slate-400">➕ Incluir Bloco:</span>

                  {/* Block Inserters */}
                  <button type="button" onClick={() => insertFullscreenVisualBlock('<div style="background-color: #ffffff; padding: 16px 20px; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); margin-bottom: 12px;"><p style="font-size: 14px; margin: 0; color: #1e293b;">Novo bloco de texto...</p></div>')} className="px-2 py-1 text-[10px] font-bold bg-white text-slate-900 rounded hover:bg-slate-100 cursor-pointer">📦 + Card</button>
                  <button type="button" onClick={() => insertFullscreenVisualBlock('<div style="background-color: #fff3cd; border-left: 4px solid #f0a500; border-radius: 6px; padding: 14px 16px; margin-bottom: 12px;"><h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 800; color: #856404;">⚠️ Título do Alerta</h4><p style="margin: 0; font-size: 13px; color: #856404;">Mensagem de alerta...</p></div>')} className="px-2 py-1 text-[10px] font-bold bg-amber-200 text-amber-950 rounded hover:bg-amber-300 cursor-pointer">⚠️ + Alerta</button>
                  <button type="button" onClick={() => insertFullscreenVisualBlock('<div style="background-color: #fee2e2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 14px 16px; margin-bottom: 12px;"><h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 800; color: #991b1b;">🔴 Alerta Crítico</h4><p style="margin: 0; font-size: 13px; color: #7f1d1d;">Mensagem de aviso crítico...</p></div>')} className="px-2 py-1 text-[10px] font-bold bg-rose-200 text-rose-950 rounded hover:bg-rose-300 cursor-pointer">🔴 + Crítico</button>
                  <button type="button" onClick={() => insertFullscreenVisualBlock('<div style="background-color: #e8f5e9; border: 1.5px solid #2e7d32; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; display: flex; gap: 12px;"><div style="font-size: 20px; color: #2e7d32;">✅</div><div><h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 900; color: #2e7d32;">Título Sucesso</h3><p style="margin: 0; font-size: 13px; color: #1b5e20;">Descrição afirmativa...</p></div></div>')} className="px-2 py-1 text-[10px] font-bold bg-emerald-200 text-emerald-950 rounded hover:bg-emerald-300 cursor-pointer">✅ + Sucesso</button>
                  <button type="button" onClick={() => insertFullscreenVisualBlock('<div style="background-color: #1a5fa8; color: #ffffff; padding: 18px 20px; border-radius: 8px; text-align: center; margin-bottom: 12px;"><h3 style="margin: 0 0 4px 0; font-size: 16px; font-weight: 900; color: #ffffff;">Dúvidas? Fale com o suporte</h3><p style="margin: 0 0 14px 0; font-size: 13px; opacity: 0.95;">Estamos prontos para auxiliá-lo.</p><a href="https://wa.me/5567998269796" target="_blank" style="background-color: #ffffff; color: #1a5fa8; font-weight: 900; font-size: 13px; padding: 10px 22px; border-radius: 6px; text-decoration: none; display: inline-block;">💬 WhatsApp (67) 99826-9796</a></div>')} className="px-2 py-1 text-[10px] font-bold bg-sky-600 text-white rounded hover:bg-sky-500 cursor-pointer">💬 + WhatsApp</button>
                </div>

                <div className="text-[11px] text-slate-300 font-bold bg-slate-950 px-3 py-1.5 rounded flex items-center justify-between border border-slate-800">
                  <span>✨ Editor Visual em Tela Cheia (Clique em qualquer texto para editar diretamente):</span>
                  <span className="text-[10px] text-emerald-400 font-mono">100% Sincronizado</span>
                </div>

                <div
                  ref={fullscreenVisualRef}
                  contentEditable={true}
                  suppressContentEditableWarning={true}
                  onInput={handleFullscreenVisualInput}
                  onBlur={handleFullscreenVisualInput}
                  className="w-full min-h-[500px] max-h-[calc(100vh-230px)] overflow-y-auto bg-white text-slate-900 rounded-lg p-6 border border-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/50 font-sans leading-relaxed shadow-xl select-text cursor-text"
                />
              </div>
            ) : (
              <div className="w-full max-w-[1300px] h-[calc(100vh-140px)] flex gap-5">
                <div className="w-1/2 flex flex-col bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Editor de HTML / Texto</span>
                    <span className="text-[10px] text-slate-400">Edições no código atualizam o preview ao lado</span>
                  </div>
                  <textarea
                    className="w-full flex-1 bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-lg border border-slate-800 focus:border-brand-500 focus:outline-none leading-relaxed resize-none"
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                  />
                </div>
                <div className="w-1/2 flex flex-col bg-white rounded-xl border border-slate-800 p-4 overflow-y-auto">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pré-Visualização em Tempo Real</span>
                  <div
                    className="w-full"
                    dangerouslySetInnerHTML={{
                      __html: compileTemplateText(formContent || '<p>Preencha o conteúdo do template...</p>', 'markdown')
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
