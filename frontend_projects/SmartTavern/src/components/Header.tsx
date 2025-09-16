import React from 'react'
import { motion } from 'framer-motion'
import '@/styles/Header.css'

export default function Header() {
  return (
    <header className="header" role="banner" aria-label="SmartTavern 顶部栏">
      <motion.div
        className="brand"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        aria-hidden
      />
      <div>
        <div className="header-title">SmartTavern 对话系统</div>
        <div className="header-subtitle">基于 SmartTavern 工作流 + Gemini 2.5 Flash</div>
      </div>
    </header>
  )
}