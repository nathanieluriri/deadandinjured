import streamlit as st
import re
from database import login,signup,save_chat_history,is_username_still_valid,get_chat_history_by_secret_key


if "guesses" not in st.session_state:
    st.session_state.guesses=[]




@st.experimental_dialog("ENTER YOUR LOGIN DETAILS")
def Login():
    st.write("Enter your Login Details")
    username = st.text_input("Username")
    password= st.text_input("Password",type="password")
    if st.button("Submit"):
        st.session_state.UD = login(username,password)
        if st.session_state.UD:
            


            st.rerun()

        elif st.session_state.UD==None:
            st.error("Something is wrong with the user details")



@st.experimental_dialog("Fill In The Form To Sign Up")
def SignUp():
    
    username = st.text_input("Username")
    if username.strip()!="":
        if is_username_still_valid(username):
            FirstName = st.text_input("First Name")
            if FirstName.strip()!="":
                Email = st.text_input("Email")
                if Email.strip()!="":
                    if is_valid_email(Email):
                        password= st.text_input("Password",type="password")
                        if st.button("Submit"):
                            st.session_state.UD = signup(user=username,passw=password,first_name=FirstName,email=Email)
                            print(st.session_state.UD)
                            if st.session_state.UD:
                                st.rerun()
                            elif st.session_state.UD==None:
                                st.error("Something is wrong with the user details")
        elif is_username_still_valid(username)==False:
            st.error("Username is Invalid")
        elif is_valid_email(Email)==False:
            st.error("Email Is invalid")
        




def is_valid_email(email):
    # Regular expression pattern for validating email addresses
    pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    
    # Use re.match to check if the email matches the pattern
    if re.match(pattern, email):
        return True
    else:
        st.error("Invalid email address")
        return False


if "UD" not in st.session_state:
    st.session_state.UD=None


if st.session_state.UD==None:
    if st.button("Login"):
        Login()
        
        

    if st.button("Sign Up"):
        SignUp()

if st.session_state.UD is not None:
    st.write(f"welcome back {st.session_state.UD.first_name}")
    
    if st.button("Multiplayer mode",type="primary"):
        st.switch_page("pages/multiplayer.py")
    if st.button("Single Player Mode",type="primary"):
        st.switch_page("pages/singleplayer.py")
        
