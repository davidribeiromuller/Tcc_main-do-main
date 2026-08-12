import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ShieldCheck, UserCog, Trash2, Search, AlertTriangle, Users } from "lucide-react";
import { User } from "../types";

interface AdminPanelProps {
  usersList: User[];
  onUpdateUser: (userId: number, updateData: any) => Promise<void>;
  onDeleteUser: (userId: number) => Promise<void>;
  currentUser: User | null;
}

export default function AdminPanel({
  usersList,
  onUpdateUser,
  onDeleteUser,
  currentUser
}: AdminPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredUsers = usersList.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      (u.nome && u.nome.toLowerCase().includes(term)) ||
      u.email.toLowerCase().includes(term) ||
      (u.role && u.role.toLowerCase().includes(term))
    );
  });

  const handleRoleChange = (userId: number, selectRole: string) => {
    onUpdateUser(userId, { role: selectRole });
  };

  const handleAdminToggle = (userId: number, currVal: boolean) => {
    // Prevent self-demotion
    if (currentUser?.id === userId && currVal) {
      alert("Você não pode remover seu próprio acesso administrativo!");
      return;
    }
    onUpdateUser(userId, { isAdmin: !currVal });
  };

  const handleAtivoToggle = (userId: number, currVal: boolean) => {
    onUpdateUser(userId, { ativo: !currVal });
  };

  const handleDeleteClick = (userId: number, uName: string) => {
    if (currentUser?.id === userId) {
      alert("Você não pode deletar sua própria conta ativa.");
      return;
    }
    if (confirm(`Atenção: Tem certeza de que quer deletar permanentemente a conta escolar de "${uName || 'Este Usuário'}"?`)) {
      onDeleteUser(userId);
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
          <div>
            <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-brand-accent dark:text-brand-primary shrink-0" />
              Painel Admin
            </h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              Controle de Perfis Escolares (RBAC)
            </p>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, email ou cargo..."
              className="w-full h-10 pl-9 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto w-full p-6 flex flex-col gap-4">
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-850 p-4 rounded-2xl flex items-start gap-2.5">
          <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18} />
          <p className="text-[10px] text-orange-700 dark:text-orange-300 leading-snug">
            <strong>Controle de Acesso Administrativo:</strong> Alterações salvas aqui se propagam em tempo real nas constraints do PostgreSQL. A exclusão de contas remove permanentemente as credenciais.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
              <Users size={36} className="text-slate-300 mb-2" />
              <p className="text-xs">Nenhum perfil corresponde aos critérios de pesquisa.</p>
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isMe = currentUser?.id === u.id;
              
              return (
                <div
                  key={u.id}
                  className="bg-white dark:bg-brand-card-dark rounded-2xl p-4 border border-brand-primary/10 shadow-xs flex flex-col gap-3 relative overflow-hidden"
                >
                  {/* Visual Strip for Me */}
                  {isMe && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-brand-primary" />
                  )}

                  {/* Header info */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs uppercase uppercase select-none">
                        {u.foto_perfil ? (
                          <img src={u.foto_perfil} alt={u.nome} referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          (u.nome || u.email || "U").slice(0, 1)
                        )}
                      </div>
                      <div>
                        <h4 className="font-display font-semibold text-xs leading-none">
                          {u.nome || " Hudson W."} {isMe && <span className="text-[9px] text-brand-accent">(Eu)</span>}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-mono inline-block mt-1">{u.email}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteClick(u.id, u.nome || "Este usuário")}
                      disabled={isMe}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 disabled:opacity-30 cursor-pointer"
                      title="Deletar permanentemente"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Settings toggles */}
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-50 dark:border-slate-800/80 pt-3 text-[10px]">
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-400 font-bold block">CARGO / FUNÇÃO</span>
                      <select
                        value={u.role || "Aluno"}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="h-8 p-0 px-2 bg-slate-50 dark:bg-black/10 border border-brand-primary/25 rounded-lg text-[10px] focus:outline-none"
                      >
                        <option value="Aluno">Aluno(a)</option>
                        <option value="Diretor">Diretor(a)</option>
                        <option value="Pedagogo(a)">Pedagogo(a)</option>
                        <option value="Professor">Professor(a)</option>
                        <option value="Responsáveis">Responsáveis</option>
                        <option value="Funcionário">Funcionário(a)</option>
                        <option value="Cliente">Cliente</option>
                      </select>
                    </div>

                    <div className="flex flex-col justify-end gap-2 px-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={u.isAdmin}
                          onChange={() => handleAdminToggle(u.id, u.isAdmin)}
                          disabled={isMe}
                          className="w-3.5 h-3.5 accent-brand-accent disabled:opacity-40"
                        />
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Acesso Administrador</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={u.ativo}
                          onChange={() => handleAtivoToggle(u.id, u.ativo)}
                          className="w-3.5 h-3.5 accent-brand-accent"
                        />
                        <span className="font-semibold text-slate-600 dark:text-slate-300">Usuário Ativo</span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
