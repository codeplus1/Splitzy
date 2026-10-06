import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Share2, QrCode } from 'lucide-react';
import { Group, SupportedLanguage } from '../types';

export interface ShareGroupModalProps {
  isOpen: boolean;
  group: Group;
  language: SupportedLanguage;
  onClose: () => void;
}

export const ShareGroupModal: React.FC<ShareGroupModalProps> = ({
  isOpen,
  group,
  language,
  onClose,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isFrench = language === 'fr';
  const inviteCode = group.inviteCode || 'SPLIT1';
  const baseUrl =
    (import.meta.env && import.meta.env.VITE_APP_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://splitzy.vercel.app');
  const shareUrl = `${baseUrl.replace(/\/$/, '')}/?join=${inviteCode}`;

  useEffect(() => {
    if (isOpen && inviteCode) {
      QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#101D2D',
          light: '#FFFFFF',
        },
      })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('Failed to generate QR code', err));
    }
  }, [isOpen, inviteCode, shareUrl]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${group.name} on Splitze`,
          text: `Join our group "${group.name}" on Splitze (Split smart. Stay even.) to track shared expenses together:`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div
      id="share-group-modal-backdrop"
      className="ui-modal-backdrop"
      onClick={onClose}
    >
      <div
        id="share-group-modal-card"
        className="ui-modal-card max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand-text)] flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-base tracking-tight text-[var(--text-primary)]">
                {isFrench ? 'Inviter au groupe' : 'Invite to Group'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">{group.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ui-icon-btn w-8 h-8"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-center">
          {/* QR Code Container */}
          <div className="inline-block p-3 rounded-xl bg-white shadow-xs border border-[var(--border-default)]">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt={`QR Code to join ${group.name}`}
                className="w-44 h-44 mx-auto rounded-lg object-contain"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                Generating QR code...
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {isFrench
              ? 'Faites scanner ce code ou partagez le code d’invitation pour synchroniser le groupe.'
              : 'Scan with camera or share the invite code to join this group instantly.'}
          </p>

          {/* Invite Code Box */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] flex items-center justify-between gap-3">
            <div className="text-left min-w-0">
              <span className="text-xs font-medium text-[var(--text-secondary)] block">
                {isFrench ? 'Code d’invitation' : 'Invite Code'}
              </span>
              <span className="font-mono text-base font-semibold tracking-widest text-[var(--brand-text)]">
                #{inviteCode}
              </span>
            </div>

            <button
              id="share-copy-code-btn"
              onClick={handleCopyCode}
              className="ui-btn ui-btn-secondary py-1.5 px-3 text-xs"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--success-text)]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              id="share-copy-link-btn"
              onClick={handleCopyLink}
              className="ui-btn ui-btn-secondary py-2.5 px-3 text-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--success-text)]" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            <button
              id="share-native-btn"
              onClick={handleNativeShare}
              className="ui-btn ui-btn-primary py-2.5 px-3 text-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
