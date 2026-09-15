import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import ModalCadastroDepartamentos from '../components/cadastros/ModalCadastroDepartamentos'
import ModalCadastroCentroCustos from '../components/cadastros/ModalCadastroCentroCustos'
import ModalCadastroRegioes from '../components/cadastros/ModalCadastroRegioes'
import ModalCadastroFormaPagamento from '../components/cadastros/ModalCadastroFormaPagamento'
import ModalCadastroEspeciePagamento from '../components/cadastros/ModalCadastroEspeciePagamento'

interface Props {
  type: 'departamentos' | 'centro-custos' | 'regioes' | 'formas-pagamento' | 'especies-pagamento'
}

export default function CadastrosPage({ type }: Props) {
  const navigate = useNavigate()
  const [activeModal, setActiveModal] = useState<Props['type']>(type)

  useEffect(() => {
    setActiveModal(type)
  }, [type])

  const handleClose = () => {
    navigate(-1)
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <ModalCadastroDepartamentos
        isOpen={activeModal === 'departamentos'}
        onClose={handleClose}
      />

      <ModalCadastroCentroCustos
        isOpen={activeModal === 'centro-custos'}
        onClose={handleClose}
      />

      <ModalCadastroRegioes
        isOpen={activeModal === 'regioes'}
        onClose={handleClose}
      />

      <ModalCadastroFormaPagamento
        isOpen={activeModal === 'formas-pagamento'}
        onClose={handleClose}
        onSwitchToEspecie={() => setActiveModal('especies-pagamento')}
      />

      <ModalCadastroEspeciePagamento
        isOpen={activeModal === 'especies-pagamento'}
        onClose={handleClose}
        onSwitchToForma={() => setActiveModal('formas-pagamento')}
      />
    </div>
  )
}
