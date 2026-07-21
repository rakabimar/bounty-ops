import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "./api-types";
import { coreApi } from "./api-client";
import { coreQ } from "./queries";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  login: (email:string,password:string)=>Promise<AuthUser>;
  logout: ()=>Promise<void>;
  loginPending: boolean;
  logoutPending: boolean;
}

const AuthContext=createContext<AuthContextValue|null>(null);

export function AuthProvider({children}:{children:ReactNode}){
  const queryClient=useQueryClient();
  const me=useQuery(coreQ.session());
  const loginMutation=useMutation({mutationFn:({email,password}:{email:string;password:string})=>coreApi.login(email,password),onSuccess:user=>queryClient.setQueryData(["auth","me"],user)});
  const logoutMutation=useMutation({mutationFn:coreApi.logout,onSettled:()=>{queryClient.setQueryData(["auth","me"],null);queryClient.removeQueries({queryKey:["core"]});}});
  return <AuthContext.Provider value={{user:me.data??null,isLoading:me.isLoading,error:me.error,login:async(email,password)=>loginMutation.mutateAsync({email,password}),logout:async()=>{await logoutMutation.mutateAsync()},loginPending:loginMutation.isPending,logoutPending:logoutMutation.isPending}}>{children}</AuthContext.Provider>;
}

export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error("useAuth must be used within AuthProvider");return value;}
export const useMeQuery=()=>useQuery(coreQ.session());
export const useLoginMutation=()=>{const queryClient=useQueryClient();return useMutation({mutationFn:({email,password}:{email:string;password:string})=>coreApi.login(email,password),onSuccess:user=>queryClient.setQueryData(["auth","me"],user)});};
export const useLogoutMutation=()=>{const queryClient=useQueryClient();return useMutation({mutationFn:coreApi.logout,onSettled:()=>{queryClient.setQueryData(["auth","me"],null);queryClient.removeQueries({queryKey:["core"]});}});};
