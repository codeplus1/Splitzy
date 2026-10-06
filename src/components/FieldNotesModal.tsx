import React from 'react';
import { X, BookOpen, CheckCircle2, DollarSign, Camera, Users, Repeat, ShieldCheck, CreditCard, Archive } from 'lucide-react';
import { SupportedLanguage } from '../types';

interface FieldNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: SupportedLanguage;
}

export const FieldNotesModal: React.FC<FieldNotesModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  if (!isOpen) return null;

  const isFrench = language === 'fr';

  const notes = [
    {
      num: '01',
      icon: DollarSign,
      title: isFrench ? 'Confirmez d’abord votre devise principale' : 'Confirm your home currency first',
      body: isFrench
        ? 'Les aperçus calculent tout dans votre devise principale (CAD, USD ou EUR). Splitze la détecte automatiquement — confirmez-la ou changez-la dans les Paramètres.'
        : 'Insights totals everything in your home currency (CAD, USD, or EUR). Splitze detects it from your device — confirm it or switch anytime in Settings.',
    },
    {
      num: '02',
      icon: Camera,
      title: isFrench ? 'Donnez une vue dégagée au scanner' : 'Give the scanner a clear view',
      body: isFrench
        ? 'Aplatissez le reçu, trouvez un bon éclairage et cadrez l’ensemble. Le scanner laser lit automatiquement les articles, taxes et pourboires.'
        : 'Flatten the receipt, find decent light, fit the whole bill in the frame, and hold steady — Splitze pulls out every line ready to split in seconds.',
    },
    {
      num: '03',
      icon: Users,
      title: isFrench ? 'En mode Par article, n’assignez que les choix persos' : 'In Items mode, assign only the personal stuff',
      body: isFrench
        ? 'Toute ligne sans personne assignée est automatiquement partagée entre tous les membres. Assignez les plats persos et laissez les entrées communes.'
        : 'Any line with nobody selected is shared by everyone automatically. Assign the personal items and leave the common ones alone.',
    },
    {
      num: '04',
      icon: CheckCircle2,
      title: isFrench ? 'Choisissez le mode de partage adapté' : 'Pick the split mode that fits',
      body: isFrench
        ? 'Égal pour un partage parfait, Parts quand quelqu’un compte double, Exact pour les montants au centime près — le solde « Restant » vous guide.'
        : 'Equal for an even split, Shares when someone counts double, Exact when you know each amount — the live “Remaining” counter tells you when it balances.',
    },
    {
      num: '05',
      icon: Repeat,
      title: isFrench ? 'Répétez le loyer une seule fois' : 'Set rent to repeat — once',
      body: isFrench
        ? 'Hebdomadaire, toutes les 2 semaines ou mensuel. Loyer, WiFi ou abonnements restent synchronisés sans ressaisie chaque mois.'
        : 'Weekly, every 2 weeks, or monthly. Mark recurring bills like rent or WiFi so they stay organized without manual entry every month.',
    },
    {
      num: '06',
      icon: ShieldCheck,
      title: isFrench ? 'Protégez le lien d’invitation' : 'Guard the invite link in big chats',
      body: isFrench
        ? 'Chaque groupe possède un code sécurisé ou QR code. Vous pouvez réinitialiser le lien d’invitation si nécessaire.'
        : 'Each group generates a unique invite code or QR card. Share with only your circle, or reset the code anytime.',
    },
    {
      num: '07',
      icon: CreditCard,
      title: isFrench ? 'Partagez votre Interac / coordonnées pour être remboursé' : 'Share your Interac so money finds you',
      body: isFrench
        ? 'Ajoutez votre courriel Interac e-Transfer, UPI ou compte bancaire. Seules les personnes qui vous doivent de l’argent pourront le voir d’un clic.'
        : 'Add your Interac contact, UPI, or banking handle in your profile so people who owe you can settle in one tap.',
    },
    {
      num: '08',
      icon: Archive,
      title: isFrench ? 'Règlements simplifiés au minimum' : 'Simplest debt settlement',
      body: isFrench
        ? 'Splitze calcule l’ensemble minimal de transferts pour que tout le monde soit quitte, sans allers-retours inutiles.'
        : 'Splitze computes the minimum number of transactions needed to square all debts, ending endless circular payments.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1420]/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#152436] rounded-3xl shadow-2xl border border-[var(--border)] overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 bg-[#F5F7FA] dark:bg-[#101D2D] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#101D2D] dark:bg-[#63E6BE] text-[#63E6BE] dark:text-[#101D2D] flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8B9AAF]">
                {isFrench ? 'Carnet Splitze' : 'Splitze Field Notes'}
              </span>
              <h2 className="text-xl font-bold font-display text-[#101D2D] dark:text-white">
                {isFrench ? 'Tirer le meilleur de Splitze' : 'Get the most out of Splitze'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8B9AAF] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-[var(--ink-secondary)]">
            {isFrench
              ? 'Huit petites habitudes pour garder des groupes ordonnés et équitables — toutes ancrées dans le fonctionnement réel de Splitze.'
              : 'Eight small habits that keep groups tidy and fair — all grounded in how Splitze actually works.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
            {notes.map(note => {
              const Icon = note.icon;
              return (
                <div
                  key={note.num}
                  className="p-4 rounded-2xl bg-[#F5F7FA] dark:bg-[#0B1420]/70 border border-[var(--border)] hover:border-[#63E6BE] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-[#101D2D] dark:text-[#101D2D] bg-[#63E6BE] px-2 py-0.5 rounded-md">
                      {note.num}
                    </span>
                    <Icon className="w-4 h-4 text-[#101D2D] dark:text-[#63E6BE]" />
                  </div>
                  <h3 className="text-sm font-bold text-[#101D2D] dark:text-white mb-1">
                    {note.title}
                  </h3>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                    {note.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#F5F7FA] dark:bg-[#101D2D] border-t border-[var(--border)] flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-primary px-5 py-2.5 text-sm font-semibold rounded-xl"
          >
            {isFrench ? 'Compris !' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};
