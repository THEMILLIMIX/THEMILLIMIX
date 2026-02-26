import React from 'react';
import { ServiceItem } from '../types';
import { Plus, Check } from 'lucide-react';

interface ServiceCardProps {
  service: ServiceItem;
  isSelected: boolean;
  onSelect: (service: ServiceItem) => void;
  isCollaboration?: boolean;
  discountRate?: number;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, isSelected, onSelect, isCollaboration, discountRate = 0 }) => {
  const displayPrice = isCollaboration 
    ? Math.floor(service.price * (1 - discountRate)) 
    : service.price;

  return (
    <div 
      className={`
        relative p-8 rounded-2xl border transition-all duration-300 cursor-pointer
        flex flex-col justify-between min-h-[320px] group
        ${isSelected 
          ? 'bg-[#0a0a0a] border-neutral-700 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]' 
          : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-neutral-700'
        }
      `}
      onClick={() => onSelect(service)}
    >
      <div>
        <div className="flex items-start mb-6">
          <span className="text-[10px] font-medium px-2 py-1 rounded bg-[#161616] text-neutral-400 border border-[#222]">
            믹싱 & 마스터링
          </span>
        </div>
        
        <h3 className="text-2xl font-bold text-white mb-4">{service.name}</h3>
        <p className="text-neutral-400 text-[15px] leading-relaxed whitespace-pre-line">
          {service.description}
        </p>
        
        <div className="mt-6 text-neutral-500 text-sm space-y-1">
             {service.features?.map((f, i) => (
                 <p key={i}>( {f} )</p>
             ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto pt-8">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white tracking-tight">₩{displayPrice.toLocaleString()}</span>
          <span className="text-sm text-neutral-600 font-medium">/ {service.unit}</span>
        </div>
        
        <button 
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
            ${isSelected 
              ? 'bg-white text-black scale-110' 
              : 'bg-white text-black hover:scale-110'
            }
          `}
        >
          {isSelected ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={3} />}
        </button>
      </div>
    </div>
  );
};