# database to store chats and with a secretkey to enter a chatroom thats the first test 
# before you think couldn't this have been done
# yes it has
# but now we can constantly check for a connection and if there is a connection we can initiate a full rerun 
from database import login,signup,save_chat_history,is_username_still_valid,get_chat_history_by_secret_key



import re


    



import streamlit as st
import time

st.write("# chat system ")

tab1,tab2= st.tabs(["Settings","Chat"])

@st.experimental_dialog("ENTER YOUR LOGIN DETAILS")
def Login():
    st.write("Enter your Login Details")
    username = st.text_input("Username")
    password= st.text_input("Password",type="password")
    if st.button("Submit"):
        st.session_state.UD = login(username,password)
        if st.session_state.UD:
            st.toast("Succesful Login")
            time.sleep(3)
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
    st.session_state.secretroomkey=None



with tab1:
    st.write("To join the chat system copy code below and paste in the join chatroom space")
    if st.session_state.UD==None:
        if st.button("Login"):
            Login()
            
            

        if st.button("Sign Up"):
            SignUp()
            

    if "secretkeyareyousure" not in st.session_state:
        st.session_state.secretkeyareyousure=False



    
            
    else:
            
            st.text_input("Enter your secret key",key="secretroomkey",disabled=st.session_state.secretkeyareyousure)
            if st.button("If you are sure about the key you entered click me to disable the button"):
                st.session_state.secretkeyareyousure=True
                st.rerun()

        
            st.write("copy and share secret key below")
            
            st.code(st.session_state.secretroomkey)
with tab2:
        @st.experimental_fragment(run_every=1)
        def get_messages():
            st.session_state.messages = get_chat_history_by_secret_key(st.session_state.secretroomkey)
        if "messages" not in st.session_state:
            st.session_state.messages = []
        if st.session_state.UD:
            get_messages()

        # Display chat messages
        @st.experimental_fragment(run_every=1)
        def show_messages():
            try:
                for message in st.session_state.messages:
                    user=st.chat_message("user")
                    user.write(message)
            except:
                pass

        if st.session_state.UD:
            show_messages()

        # Create an input box for new chat messages
        user_input = st.chat_input("Type your message here...")

        # Handle the new chat message
        if user_input:
        # Add the new message to the session state
            st.session_state.messages.append({"user":f"{user_input}"})
            print(st.session_state.messages)

            save_chat_history(st.session_state.secretroomkey,st.session_state.messages)
            # Display the new message
            st.rerun()

           



