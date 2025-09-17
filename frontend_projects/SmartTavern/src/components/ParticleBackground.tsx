import React, { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import '@/styles/ParticleBackground.css'

type Particle = {
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  color: string
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  
  const particles = useMemo(() => {
    const particleCount = 50
    const colors = ['var(--particle-color-1)', 'var(--particle-color-2)', 'var(--particle-color-3)', 'var(--particle-color-4)', 'var(--particle-color-5)']
    
    return Array.from({ length: particleCount }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.5 + 0.1,
      opacity: Math.random() * 0.6 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)]
    }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const updateSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      particles.forEach(particle => {
        // 更新位置
        particle.y -= particle.speed
        if (particle.y < -10) {
          particle.y = canvas.height + 10
          particle.x = Math.random() * canvas.width
        }

        // 缓慢水平漂移
        particle.x += Math.sin(Date.now() * 0.001 + particle.y * 0.01) * 0.3

        // 保持在画布内
        if (particle.x < -10) particle.x = canvas.width + 10
        if (particle.x > canvas.width + 10) particle.x = -10

        // 绘制粒子
        ctx.save()
        ctx.globalAlpha = particle.opacity
        ctx.fillStyle = particle.color
        ctx.shadowBlur = particle.size * 2
        ctx.shadowColor = particle.color
        
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    updateSize()
    animate()

    const handleResize = () => updateSize()
    window.addEventListener('resize', handleResize)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      window.removeEventListener('resize', handleResize)
    }
  }, [particles])

  return (
    <motion.canvas
      ref={canvasRef}
      className="particle-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2 }}
    />
  )
}