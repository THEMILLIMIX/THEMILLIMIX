import React from 'react';
import { ServiceItem } from '../types';
import { Plus, Minus, Check, Sparkles } from 'lucide-react';

interface OptionCardProps {
  option: ServiceItem;
  quantity: number;
  onUpdate: (delta: number) => void;
  isMultiplier?: boolean;
  isActive?: boolean;
  isCollaboration?: boolean;
  discountRate?: number;
}

export const OptionCard: React.FC<OptionCardProps> = ({ 
  option, 
  quantity, 
  onUpdate, 
  isMultiplier = false,
  isActive = false,
  isCollaboration = false,
  discountRate = 0
}) => {
  const isSelected = quantity > 0 || isActive;
  const displayPrice = isCollaboration 
    ? Math.floor(option.price * (1 - discountRate)) 
    : option.price;

  return (
    <div className={`
      relative px-6 py-5 rounded-xl border transition-all duration-200
      flex justify-between items-center group min-h-[90px]
      ${isMultiplier 
        ? (isActive ? 'bg-[#0F0B1A] border-indigo-900/50' : 'bg-[#0B0810] border-[#1A1625] hover:border-indigo-900/30') 
        : (isSelected ? 'bg-[#0F0F0F] border-neutral-700' : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-neutral-800')
      }
    `}>
      {/* Left Content */}
      <div className="flex-1 pr-6">
        <div className="flex items-center gap-2 mb-1.5">
          <h4 className={`font-bold text-base ${isMultiplier ? 'text-indigo-200' : 'text-neutral-200'}`}>
            {option.name} 
          </h4>
          {option.unit && !option.features?.includes('INCLUDED') && !isMultiplier && (
              <span className="text-[10px] bg-[#161616] text-neutral-500 px-2 py-0.5 rounded border border-[#222]">
                {option.unit}
              </span>
            )}
           {isMultiplier && (
               <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                $
              </span>
           )}
        </div>
        <p className={`text-[15px] ${isMultiplier ? 'text-indigo-400/60' : 'text-neutral-500'} leading-relaxed`}>
            {option.description}
        </p>
      </div>

      {/* Right Content */}
      <div className="flex items-center gap-5 shrink-0">
         {isMultiplier ? (
             <div className="text-right">
                 <span className="block text-indigo-400 font-bold text-sm">x5.0</span>
                 <span className="block text-[10px] text-indigo-600 font-medium tracking-wider text-right uppercase">COMMERCIAL</span>
             </div>
         ) : (
            <div className="font-bold text-white text-sm">
                {option.features?.includes('INCLUDED') ? (
                    <span className="text-green-500 font-bold text-[10px] tracking-wide">INCLUDED</span>
                ) : (
                    `₩${displayPrice.toLocaleString()}`
                )}
            </div>
         )}

         {/* Button */}
         {isMultiplier ? (
             <button 
                onClick={() => onUpdate(isActive ? 0 : 1)}
                className={`
                   w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                   ${isActive ? 'bg-indigo-600 text-white' : 'bg-[#1A1625] text-indigo-900 hover:bg-[#251f36]'}
                `}
              >
                {isActive ? <Check size={16} /> : <Plus size={16} />}
              </button>
         ) : option.features?.includes('INCLUDED') ? (
             <div className="w-8 h-8 rounded-lg bg-green-900/20 text-green-500 flex items-center justify-center border border-green-900/30">
                 <Check size={14} />
             </div>
         ) : (
            <div className="flex items-center gap-3">
                <button 
                    onClick={() => onUpdate(1)}
                    className="w-8 h-8 rounded-lg bg-[#161616] border border-[#222] text-neutral-400 hover:text-white hover:border-neutral-600 hover:bg-neutral-800 flex items-center justify-center transition-all"
                >
                    <Plus size={14} />
                </button>
            </div>
         )}
      </div>
    </div>
  );
};