import React from 'react';
import { UserRole } from '../types';
import { Crown, Shield, Star, Building2, Briefcase, UserCheck, User } from 'lucide-react';

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md', className = '' }) => {
  const getBadgeConfig = () => {
    switch (role) {
      case 'Founder':
        return {
          label: 'Founder',
          icon: Crown,
          bg: 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black shadow-md border border-amber-300',
          iconColor: 'text-slate-950'
        };
      case 'Super Admin':
        return {
          label: 'Super Admin',
          icon: Shield,
          bg: 'bg-red-600 text-white font-bold shadow-sm border border-red-400',
          iconColor: 'text-white'
        };
      case 'Committee':
        return {
          label: 'Committee',
          icon: Star,
          bg: 'bg-blue-600 text-white font-bold shadow-sm border border-blue-400',
          iconColor: 'text-amber-300'
        };
      case 'Room Owner':
        return {
          label: 'Room Owner',
          icon: Building2,
          bg: 'bg-emerald-600 text-white font-bold shadow-sm border border-emerald-400',
          iconColor: 'text-emerald-200'
        };
      case 'Company Owner':
        return {
          label: 'Company Owner',
          icon: Briefcase,
          bg: 'bg-purple-600 text-white font-bold shadow-sm border border-purple-400',
          iconColor: 'text-purple-200'
        };
      case 'Staff':
        return {
          label: 'Staff Member',
          icon: UserCheck,
          bg: 'bg-indigo-600 text-white font-bold shadow-sm border border-indigo-400',
          iconColor: 'text-indigo-200'
        };
      case 'Public Member':
      default:
        return {
          label: 'Public Member',
          icon: User,
          bg: 'bg-slate-700 text-slate-200 font-semibold border border-slate-600',
          iconColor: 'text-slate-300'
        };
    }
  };

  const config = getBadgeConfig();
  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'py-0.5 px-2 text-[10px] space-x-1 rounded-md',
    md: 'py-1 px-3 text-xs space-x-1.5 rounded-full',
    lg: 'py-1.5 px-3.5 text-xs space-x-2 rounded-xl'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  return (
    <span
      className={`inline-flex items-center backdrop-blur-sm tracking-wide ${config.bg} ${sizeClasses[size]} ${className}`}
    >
      <IconComponent className={`${iconSizes[size]} ${config.iconColor} shrink-0`} />
      <span>{config.label}</span>
    </span>
  );
};
