import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

type Action<T> = {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  /** Optional predicate: if it returns true the action is rendered but disabled */
  isDisabled?: (row: T) => boolean;
};

type ActionMenuProps<T> = {
  row: T;
  actions: Action<T>[];
};

export const ActionMenu = <T,>({ row, actions }: ActionMenuProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position when the menu is opened
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4, // Position below the button
        left: rect.right + window.scrollX - 128, // 128 is the menu width (w-32)
      });
    }
  }, [isOpen]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const Menu = (
    <div
      ref={menuRef}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className="fixed min-w-[128px] bg-white rounded-md shadow-lg border border-gray-200 z-50"
    >
      <ul>
        {actions.map((action) => {
          const disabled = action.isDisabled ? action.isDisabled(row) : false;
          return (
            <li key={action.label}>
              <button
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    action.onClick(row);
                    setIsOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100 cursor-pointer'}`}
              >
                {action.icon}
                {action.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded-full hover:bg-gray-200 transition-colors "
      >
        <MoreVertical size={20} className="text-gray-600 cursor-pointer" />
      </button>
      {isOpen && createPortal(Menu, document.body)}
    </>
  );
};