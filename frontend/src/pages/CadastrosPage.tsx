import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ModalCadastroDepartamentos from '../components/cadastros/ModalCadastroDepartamentos'
import ModalCadastroRegioes from '../components/cadastros/ModalCadastroRegioes'

interface Props {
  type: 'departamentos' | 'regioes'
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

      <ModalCadastroRegioes
        isOpen={activeModal === 'regioes'}
        onClose={handleClose}
      />
    </div>
  )
}
