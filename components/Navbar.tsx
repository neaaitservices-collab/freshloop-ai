'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Mic, Sparkles, LayoutDashboard, UtensilsCrossed, Leaf, AlertTriangle } from 'lucide-react';

interface NavbarProps {
  onOpenInvoiceModal?: () => void;
  onOpenVoiceModal?: () => void;
  onOpenRecipeModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenInvoiceModal,
  onOpenVoiceModal,
  onOpenRecipeModal
}) => {
  const pathname = usePathname();

  const navLinks = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/rescue', label: 'Floor Rescue', icon: AlertTriangle },
    { href: '/recipes', label: 'Recipe Fusion', icon: UtensilsCrossed },
  ];

  return (
    <>
      {/* Top Navbar Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-zinc-950/85 border-b border-emerald-900/30 text-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center gap-2.5">
              <Link href="/admin" className="flex items-center gap-2 group">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-green-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
                  <Leaf className="w-5 h-5 text-zinc-950 stroke-[2.5]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-base sm:text-xl tracking-tight bg-gradient-to-r from-emerald-400 via-teal-200 to-white bg-clip-text text-transparent">
                    FreshLoop <span className="text-emerald-400 font-extrabold text-[10px] sm:text-sm px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/30">AI</span>
                  </span>
                  <span className="hidden sm:block text-[10px] tracking-wider text-emerald-400/70 uppercase font-medium">Yield Management & Recipe Rescue</span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links (Separated into dedicated pages) */}
            <nav className="hidden md:flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* AI Action Triggers */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {/* Dedicated Voice Floor Logger Button */}
              <button
                onClick={onOpenVoiceModal}
                className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-950/80 hover:bg-teal-900 border border-teal-500/50 text-teal-300 shadow-md transition-all active:scale-95"
                title="Record floor transfer hands-free"
              >
                <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-400 animate-pulse" />
                <span className="hidden sm:inline">Voice Transfer</span>
                <span className="sm:hidden text-[11px]">Voice</span>
              </button>

              {/* Vendor Invoice OCR Button */}
              <button
                onClick={onOpenInvoiceModal}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition-all hover:border-emerald-500/40 shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                <span className="hidden sm:inline">Invoice OCR</span>
                <span className="sm:hidden text-[11px]">OCR</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Floating Bottom Dock (375x700 screens) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-emerald-900/40 px-2 py-1 flex items-center justify-around text-xs shadow-2xl">
        <Link
          href="/admin"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl ${
            pathname === '/admin' ? 'text-emerald-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Inventory</span>
        </Link>

        <Link
          href="/rescue"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl ${
            pathname === '/rescue' ? 'text-amber-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
          <span className="text-[10px]">Rescue</span>
        </Link>

        {/* Central Voice Transfer Button */}
        <button
          onClick={onOpenVoiceModal}
          className="flex flex-col items-center gap-0.5 py-1 px-3.5 -mt-3 text-zinc-100 active:scale-95 bg-gradient-to-tr from-teal-600 to-emerald-500 rounded-2xl shadow-lg shadow-teal-500/30 border border-teal-300/40"
        >
          <Mic className="w-5 h-5 text-zinc-950 fill-zinc-950" />
          <span className="text-[10px] font-black text-zinc-950">Voice</span>
        </button>

        <Link
          href="/recipes"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl ${
            pathname === '/recipes' ? 'text-emerald-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <UtensilsCrossed className="w-5 h-5" />
          <span className="text-[10px]">Recipes</span>
        </Link>
      </div>
    </>
  );
};
