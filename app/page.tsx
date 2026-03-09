'use client'
import dynamic from 'next/dynamic'

const FolhaApp = dynamic(() => import('../components/FolhaApp'), { ssr: false })

export default function Page() {
  return <FolhaApp />
}
