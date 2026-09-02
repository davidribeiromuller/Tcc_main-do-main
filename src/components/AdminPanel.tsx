import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  Trash2,
  Search,
  Users,
  LogIn,
  Edit3,
  X,
  Save,
  Mail,
  User as UserIcon,
  Phone,
  Building2,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Activity,
  Radio
} from "lucide-react";
import { User } from "../types";
import { formatLastActive, formatDateTimeBR } from "../lib/dateUtils";

interface AdminPanelProps {
  usersList: User[];
  onUpdateUser: (userId: number, updateData: any) => Promise<void>;
  onDeleteUser: (userId: number) => Promise<void>;
  onImpersonateUser?: (user: User) => void;
  currentUser: User | null;
}

export default function AdminPanel({
  usersList,
  onUpdateUser,
  onDeleteUser,
  onImpersonateUser,
  currentUser
}: AdminPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    nome: "",
    email: "",
    role: "Aluno",
    phone: "",
    institution: "",
    isAdmin: false,
    ativo: true
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredUsers = usersList.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      (u.nome && u.nome.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.role && u.role.toLowerCase().includes(term)) ||
      (u.institution && u.institution.toLowerCase().includes(term))
    );
  });

  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setEditFormData({
      nome: u.nome || "",
      email: u.email || "",
      role: u.role || "Aluno",
      phone: u.phone || "",
      institution: u.institution || "Escola estadual Helena Wysocki",
      isAdmin: !!u.isAdmin,
      ativo: u.ativo !== false
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setIsSaving(true);
      const payload: any = {
        nome: editFormData.nome.trim(),
        email: editFormData.email.trim().toLowerCase(),
        role: editFormData.role,
        institution: editFormData.institution.trim(),
        phone: editFormData.phone.trim(),
        isAdmin: editFormData.isAdmin,
        ativo: editFormData.ativo
      };

      await onUpdateUser(editingUser.id, payload);
      setEditingUser(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAdminToggle = async (userId: number, currVal: boolean) => {
    if (currentUser?.id === userId && currVal) {
      alert("Você não pode remover seu próprio acesso administrativo!");
      return;
    }
    const newIsAdmin = !currVal;
    await onUpdateUser(userId, { 
      isAdmin: newIsAdmin,
      role: newIsAdmin ? "Diretor" : "Aluno"
    });
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10 bg-brand-bg-light/80 dark:bg-brand-bg-dark/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto w-full p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-2">
                <ShieldCheck className="text-brand-accent dark:text-brand-primary shrink-0" />
                Painel da Diretoria & Administração
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gerenciamento de contas, permissões de administrador, edição de dados e acesso direto a perfis
              </p>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="bg-white dark:bg-brand-card-dark px-3.5 py-2 rounded-xl border border-brand-primary/20 flex items-center gap-2 shadow-xs">
                <Users size={15} className="text-brand-accent dark:text-brand-primary" />
                <span className="text-xs font-semibold">{usersList.length} Usuários</span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-1.5 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  {usersList.filter(u => formatLastActive(u.lastActiveAt || u.updatedAt || u.createdAt).isOnline).length} Online agora
                </span>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar usuários por nome, e-mail ou instituição..."
              className="w-full h-11 pl-10 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark placeholder-slate-400 shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto w-full p-6 flex flex-col gap-4">
        <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
          <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            <p className="font-semibold">Gerenciamento Escolar & Atividade de Usuários:</p>
            <p className="text-[11px] opacity-90 mt-0.5">
              Acompanhe a <strong>última vez que cada usuário entrou no aplicativo</strong>, acesse contas com 1 clique, ative <strong>Privilégios de Administrador</strong>, modifique dados cadastrais e gerencie acessos com segurança.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <Users size={40} className="text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium">Nenhum perfil escolar encontrado.</p>
              <p className="text-xs text-slate-400 mt-1">Verifique o termo de pesquisa digitado.</p>
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isMe = currentUser?.id === u.id || (currentUser?.email && u.email && currentUser.email.toLowerCase() === u.email.toLowerCase());
              const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
              const activity = formatLastActive(activityDate);
              const formattedDateStr = formatDateTimeBR(activityDate);
              
              return (
                <div
                  key={u.id}
                  className="bg-white dark:bg-brand-card-dark rounded-2xl p-5 border border-brand-primary/15 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-3.5 relative overflow-hidden"
                >
                  {/* Top Bar Indicator */}
                  {isMe && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-brand-accent" />
                  )}

                  {/* Header info */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-sm uppercase shrink-0 select-none overflow-hidden border border-brand-primary/30">
                        {u.foto_perfil ? (
                          <img src={u.foto_perfil} alt={u.nome} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          (u.nome || u.email || "U").slice(0, 1)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                            {u.nome || "Usuário Escolar"}
                          </h4>
                          {isMe && (
                            <span className="text-[10px] bg-brand-primary/20 text-brand-accent dark:text-brand-primary px-1.5 py-0.5 rounded-md font-bold">
                              Você
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block truncate mt-0.5">
                          {u.email}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                        title="Modificar dados completos do usuário"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isMe) {
                            alert("Você não pode deletar sua própria conta ativa.");
                            return;
                          }
                          setUserToDelete(u);
                        }}
                        disabled={isMe}
                        className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 disabled:opacity-25 transition-colors cursor-pointer"
                        title="Excluir conta permanentemente"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Última Atividade / Última vez que entrou no aplicativo */}
                  <div 
                    className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs border transition-colors ${activity.badgeBg}`}
                    title={`Último acesso registrado: ${formattedDateStr}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="relative flex h-2 w-2 shrink-0">
                        {activity.isOnline && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${activity.dotColor}`} />
                      </span>
                      <span className={`text-[11px] font-semibold truncate ${activity.statusColor}`}>
                        {activity.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0 ml-1.5">
                      <Clock size={11} className="opacity-70" />
                      <span>{formattedDateStr.split(' ')[1] || formattedDateStr}</span>
                    </div>
                  </div>

                  {/* Privilégios de Administrador & Status */}
                  <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={!!u.isAdmin}
                          disabled={isMe}
                          onChange={() => handleQuickAdminToggle(u.id, !!u.isAdmin)}
                          className="w-4 h-4 rounded accent-brand-accent cursor-pointer"
                        />
                        <span className="flex items-center gap-1">
                          <ShieldCheck size={14} className={u.isAdmin ? "text-amber-500" : "text-slate-400"} />
                          <span>Privilégios de Administrador</span>
                        </span>
                      </label>

                      {u.isAdmin ? (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/50">
                          Admin Ativo
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          Padrão
                        </span>
                      )}
                    </div>

                    {/* Impersonate / Enter Account Button */}
                    {onImpersonateUser && !isMe && (
                      <button
                        type="button"
                        onClick={() => onImpersonateUser(u)}
                        className="w-full h-9 bg-brand-primary/15 hover:bg-brand-primary/25 active:scale-98 text-brand-accent dark:text-brand-primary border border-brand-primary/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                      >
                        <LogIn size={13} />
                        <span>Entrar nesta conta</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir Conta Escolar?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir permanentemente a conta de <strong>{userToDelete.nome || userToDelete.email}</strong>? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? "Excluindo..." : "Sim, Excluir"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal Dialog (Without Nova Senha) */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 relative text-slate-800 dark:text-slate-100 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold">
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Modificar Dados do Usuário
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ID: {editingUser.id} • {editingUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status de Acesso */}
              <div className="mt-3 bg-slate-50 dark:bg-black/20 rounded-xl p-2.5 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    {formatLastActive(editingUser.lastActiveAt || editingUser.updatedAt || editingUser.createdAt).isOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${formatLastActive(editingUser.lastActiveAt || editingUser.updatedAt || editingUser.createdAt).dotColor}`} />
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                    {formatLastActive(editingUser.lastActiveAt || editingUser.updatedAt || editingUser.createdAt).text}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {formatDateTimeBR(editingUser.lastActiveAt || editingUser.updatedAt || editingUser.createdAt)}
                </span>
              </div>

              {/* Edit Form */}
              <form onSubmit={handleSaveEdit} className="flex flex-col gap-3.5 mt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text"
                      required
                      value={editFormData.nome}
                      onChange={(e) => setEditFormData({ ...editFormData, nome: e.target.value })}
                      placeholder="Nome do usuário"
                      className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Endereço de E-mail
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="email"
                      required
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      placeholder="usuario@escola.pr.gov.br ou gmail"
                      className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Instituição / Escola
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        value={editFormData.institution}
                        onChange={(e) => setEditFormData({ ...editFormData, institution: e.target.value })}
                        placeholder="Escola estadual Helena Wysocki"
                        className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Telefone
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="tel"
                        value={editFormData.phone}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        placeholder="(00) 00000-0000"
                        className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={editFormData.isAdmin}
                      onChange={(e) => setEditFormData({ ...editFormData, isAdmin: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Privilégios de Administrador</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={editFormData.ativo}
                      onChange={(e) => setEditFormData({ ...editFormData, ativo: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Conta Ativa</span>
                  </label>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="h-10 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="h-10 px-5 bg-brand-accent text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-90 active:scale-98 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{isSaving ? "Salvando..." : "Salvar Alterações"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
