import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, X, Sparkles, Layers, Plus, Minus, Award, Mic2, Users, Radio, Settings, AlertCircle, Cpu, BookOpen, Download, Loader2, CheckCircle2, Trash2, Lock, MessageCircle } from 'lucide-react';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { ServiceCard } from './components/ServiceCard';
import { OptionCard } from './components/OptionCard';
import { COMMERCIAL_OPTION } from './constants';
import { CartItem, ServiceItem } from './types';

const INITIAL_SERVICES: ServiceItem[] = [
  {
    id: 'short_mix',
    name: 'Short 믹싱 & 마스터링',
    description: '1분 미만의 숏폼(릴스, 쇼츠 등)\n커버곡 콘텐츠를 위한 최적의 엔지니어링 서비스입니다.',
    price: 20000,
    type: 'base',
    exclusiveGroup: 'main_service',
    unit: '곡',
    features: ['음/박 보정 & 기본 FX 포함', '기본 3트랙 제공']
  },
  {
    id: 'full_mix',
    name: '믹싱 & 마스터링',
    description: '3분 미만의 전체곡 ( 커버곡, 자작곡 )\n반주포함 기본 3트랙 제공',
    price: 30000,
    type: 'base',
    exclusiveGroup: 'main_service',
    unit: '곡',
    features: ['음/박 보정은 옵션으로 제공됩니다.', '1인 기준입니다, 인원 추가는 옵션으로 제공됩니다.']
  }
];

const INITIAL_OPTIONS: ServiceItem[] = [
  {
    id: 'mastering_only',
    name: '마스터링',
    description: '기본으로 제공됩니다.',
    price: 0, // Included
    type: 'option',
    unit: '곡',
    features: ['INCLUDED']
  },
  {
    id: 'pitch_correction',
    name: '음정/박자 보정',
    description: '보컬의 음정과 박자를 보정하는 옵션입니다.',
    price: 10000,
    type: 'option',
    unit: '1트랙'
  },
  {
    id: 'revision',
    name: '믹싱 수정',
    description: '1회 무료 제공됩니다. 이후 수정은 유료입니다.',
    price: 10000,
    type: 'option',
    unit: '1회'
  },
  {
    id: 'add_person',
    name: '인원 추가',
    description: '믹싱 & 마스터링 인원 추가 옵션입니다.',
    price: 20000,
    type: 'option',
    unit: '1인'
  },
  {
    id: 'add_track',
    name: '1트랙 추가',
    description: '기본 제공 트랙 초과 시, 추가 트랙 비용입니다.',
    price: 10000,
    type: 'option',
    unit: '1트랙'
  },
  {
    id: 'add_minute',
    name: '1분 추가',
    description: '3분 초과시 1분 추가 옵션입니다.',
    price: 10000,
    type: 'option',
    unit: '1분'
  },
  {
    id: 'private_portfolio',
    name: '포트폴리오 미사용',
    description: '포트폴리오로 사용하지 않는 옵션입니다.',
    price: 50000,
    type: 'option',
    unit: '곡'
  },
];

export default function App() {
  const [services, setServices] = useState<ServiceItem[]>(INITIAL_SERVICES);
  const [options, setOptions] = useState<ServiceItem[]>(INITIAL_OPTIONS);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCommercial, setIsCommercial] = useState(false);
  const [isCollaboration, setIsCollaboration] = useState(false);
  const [collabPassword, setCollabPassword] = useState('');
  const [collabPasswords, setCollabPasswords] = useState<{pw: string, rate: number}[]>(() => {
    const saved = localStorage.getItem('milli_collab_passwords');
    if (saved) {
      try {
        // Support both old plain text and new encoded format for migration
        const decoded = saved.startsWith('[') ? saved : atob(saved);
        return JSON.parse(decoded);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  
  useEffect(() => {
    localStorage.setItem('milli_collab_passwords', btoa(JSON.stringify(collabPasswords)));
  }, [collabPasswords]);
  
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminInput, setAdminInput] = useState({ id: '', pw: '', secondPw: '' });
  const [newCollabPw, setNewCollabPw] = useState('');
  const [newCollabRate, setNewCollabRate] = useState(0.3);
  
  const [currentView, setCurrentView] = useState<'home' | 'portfolio' | 'system' | 'guide' | 'admin'>('home');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  
  // Calculate total price
  const subtotal = cart.reduce((sum, item) => sum + (item.item.price * item.quantity), 0);
  
  // Calculate commercial cost
  // Short Mix: 10x total (add 9x price)
  // Others: 5x total (add 4x price)
  const commercialCost = isCommercial 
    ? cart.reduce((sum, item) => {
        const itemTotal = item.item.price * item.quantity;
        const multiplier = item.id === 'short_mix' ? 9 : 4;
        return sum + (itemTotal * multiplier);
      }, 0)
    : 0;

  const beforeDiscount = subtotal + commercialCost;
  const activeCollab = collabPasswords.find(c => c.pw === collabPassword);
  const currentDiscountRate = activeCollab ? activeCollab.rate : 0;
  const collabDiscount = isCollaboration ? Math.floor(beforeDiscount * currentDiscountRate) : 0;
  const total = beforeDiscount - collabDiscount;

  // Calculate total tracks
  // Base services (Short Mix, Full Mix) provide 3 tracks by default
  const hasBaseService = cart.some(item => item.item.type === 'base');
  const baseTracks = hasBaseService ? 3 : 0;
  // Find 'add_track' option quantity
  const additionalTracks = cart.find(item => item.id === 'add_track')?.quantity || 0;
  const totalTracks = baseTracks + additionalTracks;

  // Handlers
  const handleServiceSelect = (service: ServiceItem) => {
    setCart(prev => {
      // Remove other base services
      const filtered = prev.filter(item => item.item.type !== 'base');
      // Add new service
      return [...filtered, { id: service.id, quantity: 1, item: service }];
    });
  };

  // Generic handler for updating quantity of any item (Base or Option)
  const handleQuantityUpdate = (itemId: string, delta: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      
      // If item exists in cart, update quantity
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) {
          return prev.filter(i => i.id !== itemId);
        }
        return prev.map(i => i.id === itemId ? { ...i, quantity: newQty } : i);
      } 
      
      // If item is not in cart and we are adding (delta > 0), find and add it
      if (delta > 0) {
        const itemDef = [...services, ...options].find(i => i.id === itemId);
        if (itemDef) {
           return [...prev, { id: itemId, quantity: delta, item: itemDef }];
        }
      }
      return prev;
    });
  };

  const handleCommercialToggle = () => {
    setIsCommercial(!isCommercial);
  };

  const handleCollabPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCollabPassword(val);
    if (collabPasswords.some(c => c.pw === val)) {
      setIsCollaboration(true);
    } else {
      setIsCollaboration(false);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Obfuscated credentials (Base64)
    // dGhlbWlsbGltaXg= : themillimix
    // cXdlcXdl : qweqwe
    // Mjc4NQ== : 2785
    const encodedId = btoa(adminInput.id);
    const encodedPw = btoa(adminInput.pw);
    const encodedSecondPw = btoa(adminInput.secondPw);

    if (encodedId === 'dGhlbWlsbGltaXg=' && encodedPw === 'cXdlcXdl' && encodedSecondPw === 'Mjc4NQ==') {
      setIsAdminLoggedIn(true);
    } else if (encodedId === 'dGhlbWlsbGltaXg=' && encodedPw === 'cXdlcXdl' && encodedSecondPw !== 'Mjc4NQ==') {
      alert('2차 비밀번호가 올바르지 않습니다.');
    } else {
      alert('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  const handleAddCollabPassword = (pw: string, rate: number) => {
    if (pw && !collabPasswords.some(c => c.pw === pw)) {
      setCollabPasswords([...collabPasswords, { pw, rate }]);
    }
  };

  const handlePriceUpdate = (id: string, newPrice: number) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, price: newPrice } : s));
    setOptions(prev => prev.map(o => o.id === id ? { ...o, price: newPrice } : o));
  };

  const handleDeleteCollabPassword = (pw: string) => {
    setCollabPasswords(collabPasswords.filter(c => c.pw !== pw));
  };

  const initiateDownloadProcess = () => {
    // 1. Switch to Guide View
    setCurrentView('guide');
    // 2. Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 3. Show Confirmation Modal
    setShowDownloadConfirm(true);
  };

  const handleDownloadEstimate = async () => {
    if (!invoiceRef.current || isGeneratingPdf) return;
    
    // Close modal first
    setShowDownloadConfirm(false);
    setIsGeneratingPdf(true);
    
    try {
        const element = invoiceRef.current;
        const canvas = await html2canvas(element, {
            scale: 2, // Higher scale for better quality
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        pdf.save(`THE_MILLI_MIX_Estimate_${Date.now()}.pdf`);
    } catch (error) {
        console.error("PDF Generation failed:", error);
        alert("견적서 다운로드 중 오류가 발생했습니다.");
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-200 selection:bg-purple-500/30 font-inter pb-32">
      
      {/* Hidden Invoice Template for PDF Generation */}
      <div 
        ref={invoiceRef} 
        className="fixed left-[-9999px] top-0 w-[210mm] min-h-[297mm] bg-white text-black p-12 font-sans"
        style={{ zIndex: -50 }}
      >
        {/* Header */}
        <div className="text-center mb-12 border-b-2 border-black pb-8">
            <h1 className="text-4xl font-bold tracking-[0.2em] mb-2">THE MILLI MIX</h1>
            <p className="text-sm text-neutral-500 tracking-[0.3em] uppercase">Professional Audio Engineering</p>
        </div>

        <div className="flex justify-between items-end mb-12">
            <div>
            <h2 className="text-2xl font-bold mb-1">ESTIMATE</h2>
            <p className="text-neutral-500 text-sm">견적서</p>
            </div>
            <div className="text-right">
            <p className="font-medium text-sm">Date: {new Date().toLocaleDateString('ko-KR')}</p>
            <p className="text-xs text-neutral-500 mt-1">Ref: {Date.now()}</p>
            </div>
        </div>

        {/* Table */}
        <div className="w-full mb-12">
            <div className="flex border-b-2 border-black pb-2 mb-4 text-sm font-bold uppercase tracking-wider">
            <div className="flex-1">Service</div>
            <div className="w-24 text-center">Qty</div>
            <div className="w-32 text-right">Amount</div>
            </div>

            <div className="space-y-4">
            {cart.map((item) => (
                <div key={item.id} className="flex text-sm py-2 border-b border-neutral-100 items-center">
                <div className="flex-1 pr-4">
                    <p className="font-bold mb-1">{item.item.name}</p>
                    <p className="text-[11px] text-neutral-500 whitespace-pre-line leading-relaxed">{item.item.description}</p>
                </div>
                <div className="w-24 text-center text-neutral-600">{item.quantity}</div>
                <div className="w-32 text-right font-medium">₩{(item.item.price * item.quantity).toLocaleString()}</div>
                </div>
            ))}
            
            {isCommercial && (
                <div className="flex text-sm py-3 border-b border-indigo-100 bg-indigo-50 items-center rounded px-2">
                <div className="flex-1">
                    <p className="font-bold mb-1 text-indigo-900">{COMMERCIAL_OPTION.name}</p>
                    <p className="text-[11px] text-indigo-700/70">{COMMERCIAL_OPTION.description}</p>
                </div>
                <div className="w-24 text-center text-indigo-600 text-xs font-medium">{COMMERCIAL_OPTION.unit}</div>
                <div className="w-32 text-right font-medium text-indigo-900">+₩{commercialCost.toLocaleString()}</div>
                </div>
            )}

            {isCollaboration && (
                <div className="flex text-sm py-3 border-b border-emerald-100 bg-emerald-50 items-center rounded px-2">
                <div className="flex-1">
                    <p className="font-bold mb-1 text-emerald-900">협업 할인 ({Math.round(currentDiscountRate * 100)}%)</p>
                    <p className="text-[11px] text-emerald-700/70">협업 파트너를 위한 특별 할인 혜택입니다.</p>
                </div>
                <div className="w-24 text-center text-emerald-600 text-xs font-medium">{Math.round(currentDiscountRate * 100)}% OFF</div>
                <div className="w-32 text-right font-medium text-emerald-900">-₩{collabDiscount.toLocaleString()}</div>
                </div>
            )}
            </div>
        </div>

        {/* Summary */}
        <div className="flex justify-end mb-16">
            <div className="w-72 space-y-4">
            <div className="flex justify-between text-sm text-neutral-600">
                <span>Total Tracks</span>
                <span>{totalTracks} Tracks</span>
            </div>
            {isCollaboration && (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Collaboration Discount ({Math.round(currentDiscountRate * 100)}%)</span>
                    <span>-₩{collabDiscount.toLocaleString()}</span>
                </div>
            )}
            <div className="flex justify-between items-end pt-4 border-t-2 border-black">
                <span className="font-bold text-lg">Total</span>
                <span className="text-3xl font-bold">₩{total.toLocaleString()}</span>
            </div>
            <p className="text-right text-[10px] text-neutral-400">VAT Included</p>
            </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-neutral-400 mt-auto pt-12 border-t border-neutral-200">
            <p className="mb-2">본 견적서는 참고용이며, 실제 작업 진행 시 상호 협의하에 변경될 수 있습니다.</p>
            <p>© 2026 THE MILLI MIX. All Rights Reserved.</p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showDownloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#111] border border-neutral-800 rounded-2xl max-w-md w-full p-8 shadow-2xl relative">
                <button 
                    onClick={() => setShowDownloadConfirm(false)}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
                
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center text-neutral-300 mb-6">
                        <BookOpen size={24} />
                    </div>
                    
                    <h3 className="text-xl font-bold text-white mb-2">가이드라인 확인</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed mb-8">
                        작업 진행 전, <span className="text-white font-medium">작업 규정 및 파일 제출 가이드</span>를<br/>
                        충분히 숙지하셨습니까?
                    </p>
                    
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setShowDownloadConfirm(false)}
                            className="flex-1 px-4 py-3 rounded-xl bg-[#1a1a1a] text-neutral-400 text-xs font-medium hover:bg-[#222] hover:text-white transition-colors"
                        >
                            가이드 더 읽기
                        </button>
                        <button 
                            onClick={handleDownloadEstimate}
                            className="flex-1 px-4 py-3 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <span>네, 확인했습니다</span>
                            <CheckCircle2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Hero Header */}
      <header className="pt-32 pb-16 text-center">
        <div className="animate-fade-in-down">
            <h1 className="text-6xl md:text-8xl font-light tracking-[0.3em] text-white mb-6">THE MILLI MIX</h1>
            <p className="text-sm md:text-base text-neutral-500 tracking-[0.6em] uppercase">믹싱 마스터링 커미션</p>
        </div>
        
        <nav className="flex items-center justify-center gap-12 mt-24 text-[11px] font-medium tracking-widest text-neutral-500 uppercase">
            <button 
                onClick={() => setCurrentView('home')}
                className={`transition-colors border-b pb-1 ${currentView === 'home' ? 'text-white border-white' : 'hover:text-white border-transparent'}`}
            >
                Services
            </button>
            <button 
                onClick={() => setCurrentView('portfolio')}
                className={`transition-colors border-b pb-1 ${currentView === 'portfolio' ? 'text-white border-white' : 'hover:text-white border-transparent'}`}
            >
                Portfolio
            </button>
            <button 
                onClick={() => setCurrentView('system')}
                className={`transition-colors border-b pb-1 ${currentView === 'system' ? 'text-white border-white' : 'hover:text-white border-transparent'}`}
            >
                System
            </button>
            <button 
                onClick={() => setCurrentView('guide')}
                className={`transition-colors border-b pb-1 ${currentView === 'guide' ? 'text-white border-white' : 'hover:text-white border-transparent'}`}
            >
                Guide
            </button>
            <button 
                onClick={() => setCurrentView('admin')}
                className={`transition-colors border-b pb-1 ${currentView === 'admin' ? 'text-white border-white' : 'hover:text-white border-transparent'}`}
            >
                Admin
            </button>
        </nav>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 md:px-12">
        {currentView === 'home' ? (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 lg:gap-x-20 gap-y-16">
                {/* Left Column: Services & Options */}
                <div className="lg:col-span-8 space-y-16">
                    
                    {/* Section 1: Main Services */}
                    <section>
                        <div className="mb-8">
                            <h2 className="text-xl font-normal text-white mb-2">서비스 선택</h2>
                            <p className="text-xs text-neutral-500 font-light">곡의 퀄리티를 완성할 핵심 엔지니어링 서비스입니다.</p>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            {services.map(service => (
                                <ServiceCard 
                                    key={service.id}
                                    service={service}
                                    isSelected={cart.some(item => item.id === service.id)}
                                    onSelect={handleServiceSelect}
                                    isCollaboration={isCollaboration}
                                    discountRate={currentDiscountRate}
                                />
                            ))}
                        </div>
                    </section>
        
                    {/* Section 2: Options */}
                    <section>
                        <div className="mb-8">
                            <h2 className="text-xl font-normal text-white mb-2">에디팅 & 옵션</h2>
                            <p className="text-xs text-neutral-500 font-light">필요에 따라 추가적인 디테일을 보강할 수 있는 옵션 항목입니다.</p>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            {options.map(option => (
                                <OptionCard
                                    key={option.id}
                                    option={option}
                                    quantity={cart.find(i => i.id === option.id)?.quantity || 0}
                                    onUpdate={(delta) => handleQuantityUpdate(option.id, delta)}
                                    isCollaboration={isCollaboration}
                                    discountRate={currentDiscountRate}
                                />
                            ))}
                            {/* Commercial Option */}
                            <div className="md:col-span-2 mt-1">
                                <OptionCard 
                                    option={COMMERCIAL_OPTION}
                                    quantity={0}
                                    onUpdate={handleCommercialToggle}
                                    isMultiplier={true}
                                    isActive={isCommercial}
                                    isCollaboration={isCollaboration}
                                    discountRate={currentDiscountRate}
                                />
                            </div>

                            {/* Collaboration Password Input */}
                            <div className="md:col-span-2 mt-4">
                                <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-6 transition-all hover:border-neutral-800">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-neutral-400">
                                                <Settings size={18} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-white">협업 할인 비밀번호</h3>
                                                <p className="text-[10px] text-neutral-500">비밀번호를 입력하면 협업 할인 금액이 적용됩니다.</p>
                                            </div>
                                        </div>
                                        {isCollaboration && (
                                            <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-medium bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
                                                <CheckCircle2 size={12} />
                                                <span>협업 할인 적용됨</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <input 
                                            type="password"
                                            value={collabPassword}
                                            onChange={handleCollabPasswordChange}
                                            placeholder="비밀번호를 입력하세요"
                                            className="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-700 focus:outline-none focus:border-neutral-700 transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
        
                {/* Right Column: Sidebar */}
                <div className="lg:col-span-4">
                    
                    <div className="hidden lg:block h-8" aria-hidden="true"></div>
        
                    <div className="sticky top-8 space-y-6">
                        {/* Cart Summary */}
                        <div className="bg-[#080808] border border-neutral-900 rounded-2xl min-h-[300px] flex flex-col relative overflow-hidden">
                            {cart.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-5 py-20">
                                    <div className="w-16 h-16 rounded-full border-2 border-neutral-800/50 flex items-center justify-center text-neutral-700">
                                        <ShoppingBag size={20} />
                                    </div>
                                    <span className="text-[10px] font-semibold tracking-[0.2em] text-neutral-600">YOUR CART IS EMPTY</span>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col p-6">
                                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-neutral-900">
                                         <div className="flex items-center gap-2 text-neutral-400">
                                            <ShoppingBag size={14} />
                                            <span className="text-xs font-medium tracking-widest uppercase">Estimate</span>
                                         </div>
                                         <button 
                                            onClick={() => { setCart([]); setIsCommercial(false); }}
                                            className="text-[10px] text-neutral-600 hover:text-red-400 transition-colors uppercase tracking-wider"
                                        >
                                            Clear All
                                        </button>
                                    </div>
            
                                    <div className="flex-1 space-y-6 mb-8">
                                        {cart.map(cartItem => (
                                            <div key={cartItem.id} className="flex justify-between items-start text-sm group">
                                                <div className="flex-1 pr-4">
                                                    <div className="text-neutral-300 font-medium mb-3">{cartItem.item.name}</div>
                                                    
                                                    {/* Quantity Controls in Cart */}
                                                    <div className="flex items-center bg-[#111] w-fit rounded-lg border border-neutral-800 h-7">
                                                        <button 
                                                            onClick={() => handleQuantityUpdate(cartItem.id, -1)}
                                                            className="w-8 h-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-l-lg transition-colors"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <div className="w-8 text-center text-xs font-medium text-neutral-300">
                                                            {cartItem.quantity}
                                                        </div>
                                                        <button 
                                                            onClick={() => handleQuantityUpdate(cartItem.id, 1)}
                                                            className="w-8 h-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-r-lg transition-colors"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                            <div className="text-white font-medium whitespace-nowrap pt-1">
                                                ₩{(cartItem.item.price * cartItem.quantity).toLocaleString()}
                                            </div>
                                            </div>
                                        ))}
                                        
                                        {isCommercial && (
                                            <div className="flex justify-between items-start text-sm pt-4 border-t border-neutral-900 text-indigo-400">
                                                <div className="pr-4">
                                                    <div className="font-medium mb-1 flex items-center gap-2">
                                                        {COMMERCIAL_OPTION.name}
                                                    </div>
                                                    <div className="inline-flex items-center text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-900/50">
                                                        {COMMERCIAL_OPTION.unit}
                                                    </div>
                                                </div>
                                                <div className="font-medium whitespace-nowrap">
                                                    +₩{commercialCost.toLocaleString()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="pt-6 border-t border-neutral-900 mt-auto">
                                        {/* Total Tracks Display */}
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center gap-2 text-neutral-500">
                                                <Layers size={14} />
                                                <span className="text-xs uppercase tracking-wider">Total Tracks</span>
                                            </div>
                                            <span className="text-sm font-medium text-neutral-300">
                                                {totalTracks} <span className="text-[10px] text-neutral-600 ml-0.5">TRKS</span>
                                            </span>
                                        </div>
            
                                         {isCollaboration && (
                                            <div className="flex justify-between items-center mb-2 text-emerald-400">
                                                <span className="text-[10px] uppercase tracking-wider">Collab Discount ({Math.round(currentDiscountRate * 100)}%)</span>
                                                <span className="text-sm font-medium">-₩{collabDiscount.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-end mb-6">
                                            <span className="text-neutral-500 text-xs uppercase tracking-wider">Total</span>
                                            <span className="text-2xl font-bold text-white tracking-tight">₩{total.toLocaleString()}</span>
                                        </div>

                                        <button 
                                            onClick={initiateDownloadProcess}
                                            disabled={isGeneratingPdf}
                                            className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-neutral-200 disabled:bg-neutral-500 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-xs tracking-wider uppercase"
                                        >
                                            {isGeneratingPdf ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    <span>Generating PDF...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Download size={14} />
                                                    <span>Download PDF Estimate</span>
                                                </>
                                            )}
                                        </button>

                                        <p className="text-[10px] text-neutral-700 text-center mt-3">VAT included</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                </div>
            </div>
        ) : currentView === 'admin' ? (
            // Admin View
            <div className="animate-fade-in-up">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl font-normal text-white mb-4">Admin Dashboard</h2>
                        <p className="text-xs text-neutral-500 font-light">시스템 관리 및 설정 페이지입니다.</p>
                    </div>

                    {!isAdminLoggedIn ? (
                        <div className="max-w-md mx-auto">
                            <form onSubmit={handleAdminLogin} className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 space-y-6">
                                <div className="flex flex-col items-center mb-4">
                                    <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center text-neutral-400 mb-4">
                                        <Lock size={24} />
                                    </div>
                                    <h3 className="text-lg font-medium text-white">관리자 로그인</h3>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Admin ID</label>
                                        <input 
                                            type="text"
                                            value={adminInput.id}
                                            onChange={(e) => setAdminInput({...adminInput, id: e.target.value})}
                                            className="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-700 transition-colors"
                                            placeholder="아이디를 입력하세요"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Password</label>
                                        <input 
                                            type="password"
                                            value={adminInput.pw}
                                            onChange={(e) => setAdminInput({...adminInput, pw: e.target.value})}
                                            className="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-700 transition-colors"
                                            placeholder="비밀번호를 입력하세요"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-2">2nd Password</label>
                                        <input 
                                            type="password"
                                            maxLength={4}
                                            value={adminInput.secondPw}
                                            onChange={(e) => setAdminInput({...adminInput, secondPw: e.target.value})}
                                            className="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-700 transition-colors"
                                            placeholder="2차 비밀번호를 입력하세요"
                                        />
                                    </div>
                                </div>
                                <button 
                                    type="submit"
                                    className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-neutral-200 transition-colors text-xs tracking-widest uppercase"
                                >
                                    Login
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Password Management */}
                            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                        <Settings size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-white">협업 업체 비밀번호 관리</h3>
                                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Collaboration Passwords & Rates</p>
                                    </div>
                                </div>

                                <div className="space-y-6 mb-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Password</label>
                                            <input 
                                                type="text"
                                                value={newCollabPw}
                                                onChange={(e) => setNewCollabPw(e.target.value)}
                                                placeholder="새 비밀번호"
                                                className="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-700 transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-neutral-500 uppercase tracking-widest mb-2">Discount Rate ({Math.round(newCollabRate * 100)}%)</label>
                                            <div className="flex items-center gap-4 h-[46px]">
                                                <input 
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="5"
                                                    value={newCollabRate * 100}
                                                    onChange={(e) => setNewCollabRate(parseInt(e.target.value) / 100)}
                                                    className="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            handleAddCollabPassword(newCollabPw, newCollabRate);
                                            setNewCollabPw('');
                                        }}
                                        className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-neutral-200 transition-colors text-[10px] tracking-widest uppercase"
                                    >
                                        Add Collaboration Partner
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {collabPasswords.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-4 rounded-xl bg-[#0d0d0d] border border-neutral-900 group hover:border-neutral-700 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                <div>
                                                    <span className="text-sm text-neutral-300 font-mono block">{item.pw}</span>
                                                    <span className="text-[10px] text-neutral-500 font-medium">DISCOUNT: {Math.round(item.rate * 100)}%</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleDeleteCollabPassword(item.pw)}
                                                className="w-8 h-8 flex items-center justify-center text-neutral-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Price Management */}
                            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8">
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                                        <Cpu size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-white">서비스 가격 관리</h3>
                                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Service & Option Prices</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {[...services, ...options].map(item => (
                                        <div key={item.id} className="flex items-center justify-between">
                                            <label className="text-sm text-neutral-400">{item.name}</label>
                                            <input 
                                                type="number"
                                                value={item.price}
                                                onChange={(e) => handlePriceUpdate(item.id, parseInt(e.target.value) || 0)}
                                                className="w-32 bg-[#111] border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-neutral-700 transition-colors"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-center pt-8">
                                <button 
                                    onClick={() => setIsAdminLoggedIn(false)}
                                    className="text-[10px] text-neutral-600 hover:text-white transition-colors uppercase tracking-[0.2em]"
                                >
                                    Logout Admin Session
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        ) : currentView === 'portfolio' ? (
            // Portfolio View
            <div className="animate-fade-in-up">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl font-normal text-white mb-4">Credits & Works</h2>
                        <p className="text-xs text-neutral-500 font-light">주요 작업 이력 및 경력사항입니다.</p>
                    </div>

                    <div className="space-y-8">
                        {/* Group 1: Highlight */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                            <div className="flex items-center gap-3 mb-6">
                                <Sparkles size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Major Projects</h3>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    포더모어 ( ForTheMore ) 믹싱마스터링 경력
                                </div>
                            </div>
                        </div>

                        {/* Group 2: Influencers */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                             <div className="flex items-center gap-3 mb-6">
                                <Users size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Influencer & Creator</h3>
                             </div>
                             <div className="flex flex-col gap-3">
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    26만 유튜버 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    19만 버튜버 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    3만 버튜버 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    1만 버튜버 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    하꼬 유튜버/개인 작업자 믹싱 마스터링 수백 번 외주 경력
                                </div>
                             </div>
                        </div>

                         {/* Group 3: Broadcast */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                             <div className="flex items-center gap-3 mb-6">
                                <Radio size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Broadcast & Media</h3>
                             </div>
                             <div className="flex flex-col gap-3">
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    고등래퍼3 최종 3등 출연자 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    고등래퍼2 김하온 팀 소속 1차 출연자 믹싱마스터링 경력
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    창현거리노래방 고액 상금 주인공 믹싱마스터링 경력
                                </div>
                             </div>
                        </div>

                         {/* Group 4: Official */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                             <div className="flex items-center gap-3 mb-6">
                                <Award size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Awards & Career</h3>
                             </div>
                             <div className="flex flex-col gap-3">
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    대한민국 해군 공식 CM송 공모전 해군참모총장상 수상
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    대한민국 해군복무 중 PA LIVE 엔지니어 활동
                                </div>
                                <div className="text-neutral-300 text-sm flex items-center gap-3">
                                    <span className="w-1 h-1 bg-neutral-700 rounded-full shrink-0"></span>
                                    대한민국 공영 미디어 KBS N ( Voice On The Street ) 참가
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        ) : currentView === 'system' ? (
            // System View
            <div className="animate-fade-in-up">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl font-normal text-white mb-4">System</h2>
                        <p className="text-xs text-neutral-500 font-light">작업 환경 및 장비 소개입니다.</p>
                    </div>

                    <div className="space-y-8">
                        {/* Environment */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                             <div className="flex items-center gap-3 mb-6">
                                <Cpu size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Environment</h3>
                             </div>
                             <div className="space-y-3">
                                <div className="flex justify-between items-start text-sm border-b border-[#161616] pb-2">
                                    <span className="text-neutral-500 pt-0.5">DAW</span>
                                    <span className="text-neutral-300 text-right leading-relaxed">
                                        Ableton Live 12 Suite<br/>
                                        Studio Pro 8<br/>
                                        Cubase 15 Pro
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-sm border-b border-[#161616] pb-2">
                                    <span className="text-neutral-500">Interface</span>
                                    <span className="text-neutral-300">RME BabyFace Pro FS</span>
                                </div>
                                <div className="flex justify-between items-start text-sm border-b border-[#161616] pb-2">
                                    <span className="text-neutral-500 pt-0.5">Monitoring</span>
                                    <span className="text-neutral-300 text-right leading-relaxed">
                                        Genelec 8030c<br/>
                                        Yamaha HS8PM<br/>
                                        Austrian Audio HI-X60<br/>
                                        Audio Technica ATH-M50X<br/>
                                        Sony MDR-7506
                                    </span>
                                </div>
                                <div className="flex justify-between items-start text-sm pb-1">
                                    <span className="text-neutral-500 pt-0.5">Plugins</span>
                                    <span className="text-neutral-300 text-right leading-relaxed">
                                        Antares, Arturia, Audio Ease, Celemony, Curve Audio<br/>
                                        FabFilter, Flux, IK Multimedia, iZotope, Slate Digital<br/>
                                        Sonarworks, Soundtoys, SSL, TBTECH, Waves<br/>
                                        Universal Audio (UADx), Valhalla DSP
                                    </span>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
            // Guide View
            <div className="animate-fade-in-up">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl font-normal text-white mb-4">Guide</h2>
                        <p className="text-xs text-neutral-500 font-light">작업 프로세스 및 파일 가이드라인입니다.</p>
                    </div>

                    <div className="space-y-8">
                        {/* Notice & Disclaimer */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                            <div className="flex items-center gap-3 mb-6 text-red-400">
                                <AlertCircle size={16} />
                                <h3 className="text-xs font-bold tracking-widest uppercase">IMPORTANT NOTICE</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-[#111] p-4 rounded-xl border border-red-900/20">
                                    <p className="text-neutral-300 text-xs font-medium leading-relaxed mb-2">
                                        [ 규정/정책을 숙지 하지 않아 발생하는 모든 책임은 의뢰자에게 귀속됩니다. ]
                                    </p>
                                    <p className="text-neutral-400 text-[11px] leading-relaxed">
                                        규정 위반 및 저작권 침해에 대한 모든 민·형사상 책임은 해당 작업물을 업로드한 이용자 본인에게 있습니다.
                                    </p>
                                </div>
                                <ul className="list-disc pl-4 space-y-2 text-neutral-400 text-[11px] leading-relaxed marker:text-neutral-700">
                                    <li><span className="text-neutral-300 font-medium">작업물 2차 가공 및 수정 불가:</span> 자르기, 붙이기 등을 포함한 어떠한 형태의 2차 가공도 허용되지 않습니다.</li>
                                    <li>의뢰자의 녹음 음질/보컬 실력에 따라 퀄리티의 차이가 있을 수 있습니다.</li>
                                    <li>작업 진행이 불가능한 수준일 경우 작업자로부터 재녹음 요청 또는 작업 거절이 있을 수 있습니다.</li>
                                    <li>최종 퀄리티에 문제가 생길수 있지만, 재녹음 없이 진행해도 무관하시다면 그대로 진행합니다.</li>
                                    <li>작업 거절의 경우 보컬 실력/보컬 음질이 작업 불가수준이기 때문에 재녹음 컨펌 없이 작업 거절됩니다.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Work Process & Files */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                            <div className="flex items-center gap-3 mb-6">
                                <Settings size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">WORK & FILE GUIDELINES</h3>
                            </div>
                            
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-neutral-300 text-xs font-bold border-b border-neutral-800 pb-2">작업 진행 관련</h4>
                                    <ul className="list-disc pl-4 space-y-2 text-neutral-400 text-[11px] leading-relaxed marker:text-neutral-700">
                                        <li>박자 및 음정보정은 별도 옵션이며, 기본 서비스에 포함되지 않습니다.</li>
                                        <li>작업 완료 답변 수신 후 즉시 "작업이 끝난 프로젝트 파일은 소거됩니다."</li>
                                        <li className="text-neutral-300">최종 파일은 " 48Khz / 24bit / Wav " 로 제공됩니다.</li>
                                    </ul>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-neutral-300 text-xs font-bold border-b border-neutral-800 pb-2">녹음파일 제출 규정</h4>
                                    <div className="space-y-2 text-[11px]">
                                        <div className="flex justify-between text-neutral-300 bg-[#161616] px-3 py-2 rounded">
                                            <span>보컬 (Vocal)</span>
                                            <span className="font-mono text-neutral-500">48kHz / 24bit / Mono / Wav</span>
                                        </div>
                                        <div className="flex justify-between text-neutral-300 bg-[#161616] px-3 py-2 rounded">
                                            <span>반주 (Inst)</span>
                                            <span className="font-mono text-neutral-500">48kHz / 24bit / Stereo / Wav</span>
                                        </div>
                                    </div>
                                    <ul className="list-disc pl-4 space-y-2 text-neutral-400 text-[11px] leading-relaxed marker:text-neutral-700 mt-2">
                                        <li>작업 시작 전 반드시 파일 형태와 품질을 확인해주세요.</li>
                                        <li>메인 보컬 파일은 트랙별로 정리된 상태로 제출해주세요.</li>
                                        <li>mp3, m4a 녹음본 작업 가능하나, 음질 저하 가능성이 있습니다.</li>
                                        <li>보컬파일은 잡음, 숨소리, 보컬사운드가 겹치지 않게 보내주셔야 합니다.</li>
                                        <li>보컬파일은 꼭 MR의 전체길이로 맞춘(Sync) 파일로 보내주셔야 합니다.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Timeline & Credits */}
                        <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                            <div className="flex items-center gap-3 mb-6">
                                <Award size={16} className="text-neutral-500" />
                                <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">TIMELINE & COPYRIGHT</h3>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-neutral-300 text-xs font-bold mb-2">작업 기간</h4>
                                    <p className="text-neutral-400 text-[11px] leading-relaxed mb-1">
                                        녹음본 확인/검토후, 선입금 후작업으로 진행됩니다. 입금일 다음날 기준 작업 시작됩니다.
                                    </p>
                                    <div className="flex gap-4 mt-2">
                                        <span className="bg-[#161616] text-neutral-300 text-[10px] px-2 py-1 rounded border border-[#222]">솔로/듀엣: 최소 3일 ~ 14일</span>
                                        <span className="bg-[#161616] text-neutral-300 text-[10px] px-2 py-1 rounded border border-[#222]">단체곡: 작업 기간 협의</span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-neutral-900">
                                    <h4 className="text-neutral-300 text-xs font-bold mb-3">크레딧 작성 & 포트폴리오</h4>
                                    <ul className="list-disc pl-4 space-y-2 text-neutral-400 text-[11px] leading-relaxed marker:text-neutral-700">
                                        <li>작업물은 포트폴리오 샘플 및 홍보용으로 사용될 수 있습니다.</li>
                                        <li>포트폴리오 샘플/홍보용 사용을 원하지 않을 경우, <span className="text-neutral-300">샘플 미사용 비용 50,000원이 추가됩니다.</span></li>
                                        <li>포트폴리오 미사용을 선택하였더라도, <span className="text-neutral-300">작업물에 대한 크레딧 표기는 의무 사항입니다. (미표시 불가능)</span></li>
                                        <li className="bg-[#111] inline-block px-2 py-1 rounded border border-neutral-800 text-neutral-200">
                                            크레딧 예시 : Mix Mastered By MILLI
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Refund & Communication */}
                        <div className="grid md:grid-cols-2 gap-8">
                             <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <ShoppingBag size={16} className="text-neutral-500" />
                                    <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">REFUND POLICY</h3>
                                </div>
                                <div className="space-y-3 text-[11px]">
                                    <p className="text-neutral-500 mb-2 border-b border-neutral-800 pb-2">
                                        환불시 작업중인 파일을 제공하지 않으며 / 상업적·비상업적 사용이 불가능합니다.
                                    </p>
                                    <div className="flex justify-between items-center text-neutral-300">
                                        <span>에디팅 시작</span>
                                        <span className="text-neutral-500">50% 환불</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-300">
                                        <span>믹싱 시작</span>
                                        <span className="text-neutral-500">30% 환불</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-300">
                                        <span>마스터링 시작</span>
                                        <span className="text-neutral-500">10% 환불</span>
                                    </div>
                                    <div className="flex justify-between items-center text-neutral-300">
                                        <span>마스터링 끝</span>
                                        <span className="text-red-400">환불 불가능</span>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-neutral-800 text-neutral-400">
                                        * 작업자의 마감기간 미준수시 전액환불
                                    </div>
                                </div>
                             </div>

                             <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
                                <div className="flex items-center gap-3 mb-6">
                                    <Mic2 size={16} className="text-neutral-500" />
                                    <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">COMMUNICATION</h3>
                                </div>
                                <div className="space-y-4">
                                    <p className="text-neutral-400 text-[11px] leading-relaxed">
                                        작업 중 변경사항은 즉시 연락해주세요.
                                    </p>
                                    <div className="bg-[#111] p-4 rounded-xl border border-neutral-800 flex items-center justify-center">
                                        <span className="text-neutral-300 text-xs">응답 시간: 평일 기준 3시간 내</span>
                                    </div>
                                </div>
                             </div>
                        </div>

                    </div>
                </div>
            </div>
        )}

      </main>

      {/* Footer */}
      <footer className="text-center py-24 text-[10px] text-neutral-600 tracking-[0.3em] font-light">
        THE MILLI MIX <br/><br/> © 2026 THE MILLI MIX. PROFESSIONAL AUDIO ENGINEERING.
      </footer>

      {/* KakaoTalk Floating Button */}
      <a
        href="https://open.kakao.com/me/MILLI_MIX"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-8 right-8 bg-[#1C1C1C] border border-neutral-800 text-neutral-400 p-3 rounded-full shadow-lg hover:bg-neutral-800 hover:text-white transition-colors z-50"
        aria-label="KakaoTalk Inquiry"
      >
        <MessageCircle size={28} />
      </a>
    </div>
  );
}