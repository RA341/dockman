import React, {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';
import {AuthContext} from '../hooks/auth.ts';
import {callRPC, pingWithAuth, useAuthClient} from "../lib/api.ts";
import {AuthService} from "../gen/auth/v1/auth_pb.ts";

export interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({children}) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    const [authVersion, setAuthVersion] = useState(0);

    const refreshAuthStatus = useCallback(() => {
        setAuthVersion(v => v + 1);
    }, []);

    useEffect(() => {
        setIsLoading(true);

        const checkAuthStatus = async () => {
            pingWithAuth().then(value => {
                setIsAuthenticated(value);
                console.log(`isAuthenticated is now: ${value}`)
            }).finally(() => {
                setIsLoading(false);
            });
        };

        checkAuthStatus().then();
    }, [authVersion]);

    const userClient = useAuthClient(AuthService)

    const logout = useCallback(async () => {
        const {err} = await callRPC(() => userClient.logout({}))
        if (err) {
            console.warn(err)
        }

        refreshAuthStatus();
    }, [refreshAuthStatus]);

    const contextValue = useMemo(
        () => ({
            isAuthenticated,
            isLoading,
            logout,
            refreshAuthStatus,
        }),
        [isAuthenticated, isLoading, logout, refreshAuthStatus]
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};